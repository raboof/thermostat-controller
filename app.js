#!/usr/bin/env node

var http = require('http');
var gpio = require('gpio');

var temperature;
var target;
var ramping_up = false;

var temp_over_time;
var temp_record = [];

var pin = gpio.export(process.env.HEATING_GPIO_OUT, {
  direction: 'high',
  ready: function() {
  }
});

function add_temp_to_record() {
  if (temp_record.length >= 5) {
    temp_record.shift();
  }
  temp_record.push(temperature);
}

function get_temp_over_time() {
  if (temp_record.length > 0) {
    var oldest_temp = temp_record[0];
    var newest_temp = temp_record[temp_record.length-1];
    var temp_change = newest_temp - oldest_temp;
    var time = temp_record.length * 5;
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
  if (target && temperature){

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
  add_temp_to_record();
  updatePin();
});
monitor(process.env.DB_URL + '/stream/target', function(value) {
  console.log("got " + value + " for target");
  target = value;
  updatePin();
});
