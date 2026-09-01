const assert = require('node:assert/strict');
global.libphonenumber = require('../vendor/libphonenumber-max-1.13.12.js');
global.window = { libphonenumber };
require('../phone-fields.js');
const validate = window.AdatacorePhone.validate;
for (const [country, input, expected] of [
  ['IN', '98765 43210', '+919876543210'],
  ['GB', '020 7946 0018', '+442079460018'],
  ['IT', '02 3661 8300', '+390236618300'],
  ['CA', '4165550123', '+14165550123'],
  ['US', '+1 202 555 0123', '+12025550123'],
]) assert.equal(validate(country, input).e164, expected);
for (const [country, input] of [
  ['IN', '12345'], ['IN', '+1 2025550123'], ['CA', '2025550123'],
  ['', '9876543210'], ['IN', 'call9876543210'], ['IN', '9876543210 ext 1'],
]) assert.throws(() => validate(country, input));
assert.equal(validate('', '').e164, null);
console.log('12 phone validation checks passed');
