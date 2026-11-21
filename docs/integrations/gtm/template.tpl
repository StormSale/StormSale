___INFO___
{
  "type": "TAG",
  "id": "cvt_stormsale_conversion",
  "version": 1,
  "securityGroups": [],
  "displayName": "StormSale Conversion Tracking",
  "brand": {
    "displayName": "StormSale",
    "id": "stormsale"
  },
  "description": "Sends a sandboxed StormSale conversion event (campaign, order value and currency) to the data layer. Use it with Purchase or Custom Event triggers to measure affiliate conversions.",
  "containerContexts": [
    "WEB"
  ]
}
___TEMPLATE_PARAMETERS___
[
  {
    "name": "campaignId",
    "displayName": "Campaign ID",
    "type": "TEXT",
    "simpleValueType": true,
    "help": "The StormSale campaign ID that should receive this conversion. A GTM variable such as {{Campaign ID}} is supported.",
    "valueValidators": [
      {
        "type": "NON_EMPTY"
      }
    ]
  },
  {
    "name": "orderValue",
    "displayName": "Order Value Variable",
    "type": "TEXT",
    "simpleValueType": true,
    "help": "The sale amount. Enter a GTM variable such as {{Order Value}} or a fixed numeric value.",
    "valueValidators": [
      {
        "type": "NON_EMPTY"
      }
    ]
  },
  {
    "name": "currency",
    "displayName": "Currency",
    "type": "SELECT",
    "simpleValueType": true,
    "defaultValue": "USD",
    "macrosInSelect": true,
    "selectItems": [
      {
        "value": "USD",
        "displayValue": "USD"
      },
      {
        "value": "EUR",
        "displayValue": "EUR"
      },
      {
        "value": "GBP",
        "displayValue": "GBP"
      },
      {
        "value": "XLM",
        "displayValue": "XLM"
      },
      {
        "value": "USDC",
        "displayValue": "USDC"
      }
    ],
    "help": "ISO-4217 currency code, or a variable that resolves to one."
  },
  {
    "name": "eventName",
    "displayName": "Data Layer Event Name",
    "type": "TEXT",
    "simpleValueType": true,
    "defaultValue": "stormsale_conversion",
    "help": "Event name pushed to the data layer. Create a Custom Event trigger with the same name if you want downstream tags to fire from this event."
  }
]
___SANDBOXED_JS_FOR_WEB_TEMPLATE___
const createQueue = require('createQueue');
const getType = require('getType');
const makeNumber = require('makeNumber');
const makeString = require('makeString');

const dataLayerPush = createQueue('dataLayer');

const campaignId = data.campaignId;
const rawOrderValue = data.orderValue;
const orderValue =
  getType(rawOrderValue) === 'number' ? rawOrderValue : makeNumber(rawOrderValue);
const currency = makeString(data.currency || 'USD').toUpperCase();
const eventName = data.eventName || 'stormsale_conversion';

if (!campaignId || makeString(campaignId).trim() === '') {
  data.gtmOnFailure();
  return;
}

if (getType(orderValue) !== 'number' || orderValue <= 0) {
  data.gtmOnFailure();
  return;
}

dataLayerPush({
  event: eventName,
  stormsale: {
    campaign_id: makeString(campaignId),
    order_value: orderValue,
    currency: currency
  }
});

data.gtmOnSuccess();
___WEB_PERMISSIONS___
[]
