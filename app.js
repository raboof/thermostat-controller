#!/usr/bin/env node

var http = require('http');
var gpio = require('gpio');

var temperature;
var target;
var ramping_up = false;

var pin = gpio.export(process.env.HEATING_GPIO_OUT, {
  direction: 'high',
  ready: function() {
  }
});

function updatePin() {
  if (target && temperature){
    console.log("Target: " + target + ", current: " + temperature);
    if (temperature >= target) {
      console.log("Turning off");
      ramping_up = false;
      pin.set(1, function(){});
    } else if (temperature < (target - 2)) {
      console.log("Big difference, turning on");
      ramping_up = true;
      pin.set(0, function(){});
    } else {
      if (ramping_up && temperature > (target - 1)) {
        console.log("Ramping up, turning off");
        pin.set(1, function(){});
      // a 0.2 buffer to prevent continuously turning the heater on and off 
      // when close to the target
      } else if (temperature < (target - 0.2)) {
        console.log("Turning on");
        pin.set(0, function(){});
      }
    }
  }
}

function monitor(url, callback) {
  var req = http.request(url, function(res) {
    res.setEncoding('utf8');
    res.on('data', function (chunk) {
      if (chunk.indexOf('data: ') !== -1) {
        var message = JSON.parse(chunk.substring(chunk.indexOf('data: ') + 6));
        callback(message.value);
      }
    });
    res.on('end', function() {
      console.log("eventstream for " + url + " ended, restarting");
      monitor(url, callback);
    });
  }).end();
}

monitor(process.env.DB_URL + '/stream/temperature', function(value) {
  console.log("got " + value + " for temperature");
  temperature = value;
  updatePin();
});
monitor(process.env.DB_URL + '/stream/target', function(value) {
  console.log("got " + value + " for target");
  target = value;
  updatePin();
});
