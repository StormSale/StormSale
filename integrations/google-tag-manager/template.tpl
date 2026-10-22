___INFO___

{
  "type": "TAG",
  "id": "stormsale_conversion_tracking",
  "version": 1,
  "securityGroups": [],
  "displayName": "StormSale Conversion Tracking",
  "categories": ["CONVERSIONS", "MARKETING"],
  "description": "Reports purchase and custom conversion events to StormSale.",
  "containerContexts": ["WEB"]
}

___TEMPLATE_PARAMETERS___

[
  {
    "type": "TEXT",
    "name": "campaignId",
    "displayName": "Campaign ID",
    "simpleValueType": true,
    "valueValidators": [{ "type": "NON_EMPTY" }]
  },
  {
    "type": "TEXT",
    "name": "orderValue",
    "displayName": "Order value variable",
    "simpleValueType": true,
    "help": "Select a GTM variable containing the conversion value."
  },
  {
    "type": "TEXT",
    "name": "currency",
    "displayName": "Currency",
    "simpleValueType": true,
    "defaultValue": "USD"
  }
]

___SANDBOXED_JS_FOR_WEB_TEMPLATE___

const injectScript = require('injectScript');
const createQueue = require('createQueue');
const callInWindow = require('callInWindow');
const setInWindow = require('setInWindow');

const queue = createQueue('stormsale.q');
const command = {
  event: 'conversion',
  campaignId: data.campaignId,
  value: Number(data.orderValue || 0),
  currency: String(data.currency || 'USD').toUpperCase()
};

const send = () => {
  const tracker = callInWindow('stormsale.track', command);
  if (tracker === undefined) queue(command);
  data.gtmOnSuccess();
};

if (!callInWindow('stormsale.isReady')) {
  setInWindow('stormsale.q', queue, false);
  injectScript('https://cdn.stormsale.app/tracker.min.js', send, data.gtmOnFailure, 'stormsale-tracker');
} else {
  send();
}

___WEB_PERMISSIONS___

[
  {
    "instance": {
      "key": { "publicId": "inject_script", "versionId": "1" },
      "param": [{ "key": "urls", "value": { "list": ["https://cdn.stormsale.app/*"] }]
    },
    "clientAnnotations": { "isEditedByUser": true }
  },
  {
    "instance": {
      "key": { "publicId": "access_globals", "versionId": "1" },
      "param": [
        { "key": "keys", "value": { "list": ["stormsale", "stormsale.q", "stormsale.track", "stormsale.isReady"] } },
        { "key": "read", "value": true },
        { "key": "write", "value": true },
        { "key": "execute", "value": true }
      ]
    },
    "clientAnnotations": { "isEditedByUser": true }
  }
]

___NOTES___

Configure this tag with a campaign ID, an order-value variable, and an ISO 4217
currency code. Attach it to GTM's standard Purchase trigger or a Custom Event
trigger. The sandbox permits only the StormSale tracker CDN and stormsale global.
