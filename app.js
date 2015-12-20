#!/usr/bin/env node

var http = require('http');
var gpio = require('gpio');

var temperature;
var target;

var old_temp;
var new_temp;
var old_time;
var new_time;
var interval = 24;
var counter = 0;

var pin = gpio.export(process.env.HEATING_GPIO_OUT, {
  direction: 'high',
  ready: function() {
  }
});

function record_temperature() {
  counter += 1;
  if (counter == interval) {
    old_temp = new_temp;
    old_time = new_time;
    new_temp = temperature;
    new_time = Math.floor(Date.now() / 1000);
    counter = 0;
  }
}

function get_temp_over_time() {
  if (old_temp && new_temp) {
    var temp_change = new_temp - old_temp;
    var time = new_time - old_time;
    return temp_change / time;
  }
  return 0;
}

function predict_reaching_target() {
  var changing_rate = get_temp_over_time();
  var time = 120;
  return temperature + time * changing_rate > target;
}

function updatePin() {
  if (target && temperature) {

    console.log("Target: " + target + ", current: " + temperature);
    
    var reaching_target = predict_reaching_target();

    if (reaching_target) {
      console.log("Turning off");
      pin.set(1, function(){});
    } else {
      console.log("Turning on");
      pin.set(0, function(){});
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
  record_temperature();
  updatePin();
});
monitor(process.env.DB_URL + '/stream/target', function(value) {
  console.log("got " + value + " for target");
  target = value;
  updatePin();
});
