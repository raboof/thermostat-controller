#!/usr/bin/env node

var http = require('http');
var gpio = require('gpio');

var previous_temp;
var temperature;
var target;

var heating_initiated;
var heating_time = 60;
var started_heating_at_temp;
var heating_started_at_time;
var target_changed_at_time;
var target_difference;

var pin = gpio.export(process.env.HEATING_GPIO_OUT, {
  direction: 'high',
  ready: function() {
  }
});

function get_time() {
  return Math.floor(Date.now() / 1000);
}

function turn_heating_on() {
  console.log("Turning on");
  pin.set(0, function(){});
  heating_initiated = true;
  started_heating_at_temp = temperature;
  target_difference = target - started_heating_at_temp;
  started_heating_at_time = get_time();
}

function turn_heating_off() {
  console.log("Turning off");
  pin.set(1, function(){});
}

function is_in_heating_fase() {
  return get_time() - heating_started_at_time < target_difference * heating_time;
}

function updatePin() {
  if (target && temperature && previous_temp) {
    console.log("Target: " + target + ", current: " + temperature);

    if (heating_initiated) {
      if (is_in_heating_fase()) {
        if (target_changed_at_time > started_heating_at_time && temperature > target) {
          turn_heating_off();
          heating_initiated = false;
        }
        return;
      } else {
        turn_heating_off();
        // wait for temperature drop after heating
        if (temperature < previous_temp && temperature > started_heating_at_temp) {
          // drop reached! end of cycle, time to evaluate.
          heating_initiated = false;
          var temp_reached = previous_temp;
          var difference_reached = temp_reached - started_heating_at_temp;
          if (temp_reached > target) {
            heating_time = Math.floor(heating_time / difference_reached * target_difference);
          } else if (temp_reached < target) {
            heating_time = Math.floor(heating_time / difference_reached * target_difference);
          }
        } else {
          // drop not yet reached
          return;
        } 
      }
    } else if (target > temperature) {
      turn_heating_on();
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
  previous_temp = temperature;
  temperature = value;
  updatePin();
});
monitor(process.env.DB_URL + '/stream/target', function(value) {
  console.log("got " + value + " for target");
  target = value;
  target_changed_at_time = get_time();
  updatePin();
});
