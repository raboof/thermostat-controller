#!/usr/bin/env node

var http = require('http');
var gpio = require('gpio');

var temperature;
var target;
var current_target;

var in_heating_cycle;
var heating_time = 300;
var started_heating_at_temp;
var started_heating_at_time;
var target_changed_at_time;
var target_difference;

var temperature_climbing;
var unique_temps = [];
var climbing_sequence = [false, false];
var maximum_is_reached;
var max_temp_reached;

var pin = gpio.export(process.env.HEATING_GPIO_OUT, {
  direction: 'high',
  ready: function() {
  }
});

function get_time() {
  // returns the time in rounded seconds
  return Math.floor(Date.now() / 1000);
}

function turn_heating_on() {
  console.log("Turning on");
  pin.set(0, function(){});
  started_heating_at_temp = temperature;
  target_difference = current_target - started_heating_at_temp;
  started_heating_at_time = get_time();
}

function turn_heating_off() {
  console.log("Turning off");
  pin.set(1, function(){});
}

function is_in_heating_fase() {
  return get_time() - started_heating_at_time < target_difference * heating_time;
}

function evaluate() {
  var difference_reached = max_temp_reached - started_heating_at_temp;
  if (max_temp_reached > current_target) {
    heating_time = Math.floor(heating_time / difference_reached * target_difference);
  } else if (max_temp_reached < current_target) {
    heating_time = Math.floor(heating_time / difference_reached * target_difference);
  }
}

function reset_values() {
  unique_temps.shift();
  maximum_is_reached = false;
}

function updatePin() {
  if (target && temperature) {

    console.log("Target: " + target + ", current: " + temperature);

    if (in_heating_cycle) {
      if (is_in_heating_fase()) {
        if (target_changed_at_time > started_heating_at_time && temperature > target) {
          console.log("Target was set below temperature at heating up fase, turning off");
          turn_heating_off();
          in_heating_cycle = false;
        }
        return;
      } else {
        turn_heating_off();
        if (maximum_is_reached) {
          in_heating_cycle = false;
          evaluate();
          reset_values();
        } 
      }
    } else if (temperature < target - 0.2) {
      turn_heating_on();
      in_heating_cycle = true;
      current_target = target;
    }
  }
}

function is_unique(value, array) {
  for (var i = 0; i < array.length; i++) {
    if (array[i] == value) {
      return false;
    }
  }
  return true;
}

function are_equal(array1, array2) {
  if (array1.length !== array2.length) {
    return false;
  }
  for (var i = 0, len = array1.length; i < len; i++){
    if (array1[i] !== array2[i]) {
      return false;
    }
  }
  return true;
}

function find_pattern() {
  // first find three subsequent unique temperature values, when the temperature
  // varies little, this may span some time.
  if (unique_temps.length < 3 && is_unique(temperature, unique_temps) {
    unique_temps.push(temperature);
  }

  // Once there are three temperature values, if the third value
  // is highter than the second, we know the temperature is climbing
  // else, the third value must be lower than the first, since they are
  // unique values, in this case the temperature is not climbing, but dropping.
  if (unique_temps.length == 3) {
    // compare the third subsequent unique temperature with the one before
    temperature_climbing = unique_temps[2] > unique_temps[1];
    unique_temps.shift();

    // keep track of the last two changes in temperature_climbing (false/true)
    if (temperature_climbing !== climbing_sequence[1]) {
      climbing_sequence.shift();
      climbing_sequence.push(temperature_climbing);
    }

    if (are_equal(climbing_sequence, [true, false])) {
      // Reached the top of the curve
      maximum_is_reached = true;
      max_temp_reached = Math.max(unique_temps);
    } else {
      maximum_is_reached = false;
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
  find_pattern();
  updatePin();
});
monitor(process.env.DB_URL + '/stream/target', function(value) {
  console.log("got " + value + " for target");
  target = value;
  target_changed_at_time = get_time();
  updatePin();
});
