import {Fz, Definition, KeyValue, KeyValueAny, Zh} from './types';

const attributeDef = {
	onOffAttribute: {
		"class": "onoff",
		"type": "switch",
		"ep": 1,
		"cluster": "genOnOff",
		"attribute": "onoff",
		"commands": {
			"on": "on",
			"off": "off",
		},
		"values": {
			"on": true,
			"off": false,
		},
	},
	toggleAttribute: {
		"class": "onoff",
		"type": "toggle",
		"ep": 1,
		"cluster": "genOnOff",
		"attribute": "onoff",
		"commands": {
			"toggle": "toggle",
		},
		"values": {
			"on": true,
			"off": false,
		},
	},
	startUpOnOffAttribute: {
		"class": "onoff",
		"type": "switch",
		"ep": 1,
		"cluster": "genOnOff",
		"attribute": "startUpOnOff",
		"commands": {
			"on": "write",
			"off": "write",
		},
		"values": {
			"on": true,
			"off": false,
		},
	},
	levelCtrl: {
		"class": "dimmer",
		"type": "number",
		"ep": 1,
		"cluster": "genLevelCtrl",
		"attribute": "currentLevel",
		"commands": {
			"set": {"name": "moveToLevel", "attribute": "level"},
		},
		"maxValue": 255,
		"minValue": 0,
	},
	temperature: {
		"class": "temperature",
		"type": "number",
		"ep": 1,
		"cluster": "msTemperatureMeasurement",
		"attribute": "measuredValue",
		"unit": "*C",
		"scale": 100,
	},
	pressure: {
		"class": "pressure",
		"type": "number",
		"ep": 1,
		"cluster": "msPressureMeasurement",
		"attribute": "measuredValue",
		"unit": "hPa",
		"scale": 100,
	},
	humidity: {
		"class": "pressure",
		"type": "number",
		"ep": 1,
		"cluster": "msRelativeHumidity",
		"attribute": "measuredValue",
		"unit": "%",
		"scale": 100,
	},
};

function scanFeatures(device: Zh.Device) {
	const features = [];
	device.endpoints.forEach(async (ep) => {
		ep.getInputClusters().forEach(cl => {
			if (cl.name == "genOnOff") {
				features.push({
					"type": "switch",
					"attributes": [
						{
							...attributeDef.onOffAttribute,
							"ep": ep.ID,
						},
						{
							...attributeDef.toggleAttribute,
							"ep": ep.ID,
						},
						{
							...attributeDef.startUpOnOffAttribute,
							"ep": ep.ID,
						},
					]
				});
			}
			if (cl.name == "genLevelCtrl") {
				features.push({
					"type": "light",
					"attributes": [
						{
							...attributeDef.levelCtrl,
							"ep": ep.ID,
						},
					]
				});
			}
			if (cl.name == "msTemperatureMeasurement") {
				features.push({
					"type": "temperature",
					"attributes": [
						{
							...attributeDef.temperature,
							"ep": ep.ID,
						},
					]
				});
			}
			if (cl.name == "msPressureMeasurement") {
				features.push({
					"type": "pressure",
					"attributes": [
						{
							...attributeDef.pressure,
							"ep": ep.ID,
						},
					]
				});
			}
			if (cl.name == "msRelativeHumidity") {
				features.push({
					"type": "humidity",
					"attributes": [
						{
							...attributeDef.humidity,
							"ep": ep.ID,
						},
					]
				});
			}
		});
	});
}

function generic(device: Zh.Device): Definition {
	// scan endpoints and collect features
	// generate description by collection
	return null;
};

export default generic;
module.exports = generic;
