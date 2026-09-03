# ZHDF: Zigbee Herdsman Declarative Format

## 1. Purpose and Scope

**ZHDF** is a declarative JSON format for describing Zigbee device capabilities, protocol bindings, and behavior. It serves as a language-agnostic source of truth that can generate working code for multiple target platforms (TypeScript, Python, C++, Java).

### Goals

- Cover 100% of the functionality in zigbee-herdsman-converters (~3,516 devices)
- Language-agnostic: one JSON definition generates code for any supported target
- Maximize declarativity: ~85% pure declarations, ~10% handler references, ~5% raw code escape
- Enable gradual migration: dual-format (TypeScript + JSON) coexistence

### Non-Goals

- Does not replace zigbee-herdsman (protocol stack)
- Does not replace platform-specific adapters (zigpy, ZHA, deCONZ)
- Not a general-purpose IoT format — Zigbee device definitions only

---

## 2. Architecture

### 2.1 Component Diagram

```
                    ┌──────────────────────┐
                    │   device.zhdf.json   │
                    │  (declarative spec)  │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │    ZHDF Compiler     │
                    │  (per target lang)   │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
    ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
    │  Generator  │  │  Generator   │  │  Generator   │
    │  TypeScript │  │    Python    │  │     C++      │
    └──────┬──────┘  └──────┬───────┘  └──────┬───────┘
           │                │                  │
    ┌──────▼──────┐  ┌──────▼───────┐  ┌──────▼───────┐
    │   Runtime   │  │   Runtime    │  │   Runtime    │
    │  Library    │  │   Library    │  │   Library    │
    │  (TS/JS)    │  │   (Python)   │  │    (C++)     │
    └──────┬──────┘  └──────┬───────┘  └──────┬───────┘
           │                │                  │
    ┌──────▼──────┐  ┌──────▼───────┐  ┌──────▼───────┐
    │  Platform   │  │  Platform    │  │  Platform    │
    │  Adapter    │  │  Adapter     │  │  Adapter     │
    │(z-herdsman) │  │   (zigpy)    │  │  (ZigbeeTLc) │
    └─────────────┘  └──────────────┘  └──────────────┘
```

### 2.2 Runtime Library Components

| Component | Responsibility |
|-----------|---------------|
| **Protocol Layer** | Cluster/attribute/command abstraction; message routing |
| **Transform Engine** | Scale, lookup, bitmask, clamp, formula, buffer parse |
| **State Manager** | Buffering, caching, accumulation strategies |
| **Handler Registry** | Named handler catalog; platform-specific implementations |
| **Reporting Engine** | Bind + configure reporting; interval management |
| **Event System** | Lifecycle hooks (announce, join, optionsChanged) |

---

## 3. JSON Format Specification

### 3.1 Top-Level Structure

```json
{
  "$schema": "https://zigbee2mqtt.io/schemas/zhdf-v1.json",
  "device": {
    "model": "string (required)",
    "vendor": "string (required)",
    "description": "string (required)",

    "identifiers": { ... },
    "capabilities": [ ... ],
    "customClusters": [ ... ],
    "configure": { ... },
    "handlers": [ ... ],
    "options": [ ... ],
    "meta": { ... },
    "whiteLabel": [ ... ],
    "ota": true
  }
}
```

### 3.2 Identifiers

```json
{
  "identifiers": {
    "zigbeeModel": ["TRADFRI bulb E27 WS opal 980lm"],
    "fingerprint": [
      { "modelID": "TS0601", "manufacturerName": "_TZE200_yjjdcqsq" }
    ]
  }
}
```

**Rule:** At least one of `zigbeeModel` or `fingerprint` must be present.

### 3.3 Capabilities

#### 3.3.1 Numeric

A numeric property with optional range, unit, and reporting configuration.

```json
{
  "type": "numeric",
  "name": "temperature",
  "access": "state_get",
  "unit": "°C",
  "label": "Temperature",
  "description": "Measured temperature",
  "category": "diagnostic",
  "valueMin": -40,
  "valueMax": 80,
  "valueStep": 0.1,
  "precision": 2,
  "binding": {
    "cluster": "msTemperatureMeasurement",
    "attribute": "measuredValue",
    "messageType": ["attributeReport", "readResponse"]
  },
  "transform": {
    "from": [
      { "type": "scale", "value": 0.01 },
      { "type": "clamp", "min": -40, "max": 80 },
      { "type": "precision", "digits": 2 }
    ]
  },
  "reporting": {
    "min": "10_SECONDS",
    "max": "1_HOUR",
    "change": 100
  }
}
```

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | `"numeric"` | Yes | Capability type |
| name | string | Yes | Property name (used in MQTT/state) |
| access | enum | No | Default: `"all"` |
| unit | string | No | Unit of measurement (°C, %, lx, etc.) |
| label | string | No | Human-readable label |
| description | string | No | Detailed description |
| category | enum | No | `"config"` or `"diagnostic"` |
| valueMin | number | No | Minimum value |
| valueMax | number | No | Maximum value |
| valueStep | number | No | Step size for UI sliders |
| precision | integer | No | Decimal places for rounding |
| binding | object | Yes | Protocol binding (see 3.4) |
| transform | object | No | Value transformations (see 3.5) |
| reporting | object | No | Reporting configuration |

#### 3.3.2 Binary

A boolean property (on/off, true/false, occupied/vacant).

```json
{
  "type": "binary",
  "name": "occupancy",
  "access": "state_get",
  "valueOn": true,
  "valueOff": false,
  "binding": {
    "cluster": "msOccupancySensing",
    "attribute": "occupancy",
    "messageType": ["attributeReport", "readResponse"]
  }
}
```

Binary with bit extraction:

```json
{
  "type": "binary",
  "name": "battery_low",
  "access": "state",
  "binding": {
    "cluster": "genPowerCfg",
    "attribute": "batteryAlarmState",
    "messageType": ["attributeReport", "readResponse"]
  },
  "transform": {
    "from": [{ "type": "bit", "index": 0 }]
  }
}
```

Inverted binary (contact sensor — zoneStatus bit 0 = 0 means contact):

```json
{
  "type": "binary",
  "name": "contact",
  "access": "state",
  "binding": {
    "cluster": "ssIasZone",
    "attribute": "zoneStatus",
    "messageType": ["attributeReport", "zoneStatusChangeNotification"]
  },
  "transform": {
    "from": [
      { "type": "bit", "index": 0 },
      { "type": "invert" }
    ]
  }
}
```

#### 3.3.3 Enum

A property with a fixed set of named values.

```json
{
  "type": "enum",
  "name": "fan_mode",
  "access": "all",
  "lookup": {
    "off": 0,
    "low": 1,
    "medium": 2,
    "high": 3,
    "on": 4,
    "auto": 5,
    "smart": 6
  },
  "binding": {
    "cluster": "hvacFanCtrl",
    "attribute": "fanMode",
    "messageType": ["attributeReport", "readResponse"]
  },
  "reporting": {
    "min": 0,
    "max": "1_HOUR",
    "change": 0
  }
}
```

#### 3.3.4 Text

A string property.

```json
{
  "type": "text",
  "name": "serial_number",
  "access": "state_get",
  "binding": {
    "cluster": "genBasic",
    "attribute": "modelId",
    "messageType": ["readResponse"]
  }
}
```

#### 3.3.5 Composite

A property composed of multiple sub-features. Used for complex capabilities like light, climate, cover.

```json
{
  "type": "composite",
  "name": "light",
  "features": [
    {
      "name": "state",
      "type": "binary",
      "access": "all",
      "valueOn": "ON",
      "valueOff": "OFF",
      "binding": { "cluster": "genOnOff", "attribute": "onOff" }
    },
    {
      "name": "brightness",
      "type": "numeric",
      "access": "all",
      "valueMin": 0,
      "valueMax": 254,
      "binding": { "cluster": "genLevelCtrl", "attribute": "currentLevel" }
    },
    {
      "name": "color_temp",
      "type": "numeric",
      "access": "all",
      "unit": "mired",
      "valueMin": 153,
      "valueMax": 500,
      "binding": { "cluster": "lightingColorCtrl", "attribute": "colorTemperature" }
    },
    {
      "name": "color",
      "type": "composite",
      "features": [
        { "name": "x", "type": "numeric", "access": "all", "valueMin": 0, "valueMax": 1 },
        { "name": "y", "type": "numeric", "access": "all", "valueMin": 0, "valueMax": 1 }
      ],
      "binding": { "cluster": "lightingColorCtrl", "attributes": ["currentX", "currentY"] }
    }
  ]
}
```

#### 3.3.6 Action

An event-driven property (button presses, commands).

```json
{
  "type": "action",
  "lookup": {
    "toggle": "commandToggle",
    "brightness_move_up": "commandMoveWithOnOff",
    "brightness_move_down": "commandMove",
    "brightness_stop": "commandStopWithOnOff"
  },
  "binding": {
    "commands": [
      { "cluster": "genOnOff", "commands": ["commandToggle"] },
      { "cluster": "genLevelCtrl", "commands": ["commandMoveWithOnOff", "commandMove", "commandStopWithOnOff"] }
    ]
  }
}
```

#### 3.3.7 Datapoints (Tuya-specific)

Tuya devices use a datapoint (DP) protocol instead of standard ZCL clusters.

```json
{
  "type": "datapoints",
  "protocol": "tuya",
  "datapoints": [
    { "dp": 1, "name": "temperature", "transform": { "from": [{ "type": "scale", "value": 0.1 }] } },
    { "dp": 2, "name": "humidity", "transform": { "from": [{ "type": "scale", "value": 0.1 }] } },
    { "dp": 4, "name": "battery", "unit": "%" }
  ]
}
```

### 3.4 Binding Patterns

#### 3.4.1 Zigbee Cluster Binding (from direction)

```json
{
  "binding": {
    "cluster": "msTemperatureMeasurement",
    "attribute": "measuredValue",
    "messageType": ["attributeReport", "readResponse"],
    "endpoint": 1
  }
}
```

#### 3.4.2 Zigbee Cluster Binding (to direction)

```json
{
  "binding": {
    "to": {
      "commands": [
        { "cluster": "genOnOff", "command": "off", "condition": "state == 'OFF'" },
        { "cluster": "genOnOff", "command": "on", "condition": "state == 'ON'" },
        {
          "cluster": "genLevelCtrl",
          "command": "moveToLevelWithOnOff",
          "params": {
            "level": "brightness",
            "transitionTime": "transition"
          }
        }
      ]
    }
  }
}
```

#### 3.4.3 Tuya DP Binding

```json
{
  "binding": {
    "protocol": "tuya",
    "dp": 1
  }
}
```

#### 3.4.4 Composite DP (Buffer Parse)

For DPs that encode multiple properties in a single structured buffer:

```json
{
  "type": "datapoints",
  "protocol": "tuya",
  "datapoints": [
    {
      "dp": 17,
      "transform": {
        "from": [{
          "type": "buffer",
          "structure": [
            { "offset": 0, "name": "leakage_threshold", "dataType": "uint16", "transform": { "type": "scale", "value": 0.01 } },
            { "offset": 2, "name": "leakage_breaker", "dataType": "uint8", "transform": { "type": "ne", "compare": 0, "value": true } },
            { "offset": 3, "name": "high_temp_threshold", "dataType": "uint16" },
            { "offset": 5, "name": "high_temp_breaker", "dataType": "uint8", "transform": { "type": "ne", "compare": 0, "value": true } }
          ]
        }]
      }
    }
  ]
}
```

### 3.5 Transform Engine

Transforms are applied as a chain (left-to-right for "from", right-to-left for "to").

#### Transform Types

| Transform | JSON | Semantics |
|-----------|------|-----------|
| **scale** | `{"type": "scale", "value": 0.01}` | from: multiply by value; to: divide by value |
| **offset** | `{"type": "offset", "value": -40}` | Add value |
| **lookup** | `{"type": "lookup", "mapping": {"off": 0, "on": 1}}` | Bidirectional enum mapping |
| **bit** | `{"type": "bit", "index": 0}` | Extract single bit at index |
| **bitmask** | `{"type": "bitmask", "mask": "0x03"}` | Extract bits by mask |
| **invert** | `{"type": "invert"}` | Boolean NOT (0→1, 1→0) |
| **rangeMap** | `{"type": "rangeMap", "from": [0,254], "to": [0,100]}` | Linear interpolation between ranges |
| **formula** | `{"type": "formula", "from": "10^((v-1)/10000)"}` | Mathematical expression |
| **clamp** | `{"type": "clamp", "min": -40, "max": 80}` | Bound value to range |
| **precision** | `{"type": "precision", "digits": 2}` | Round to N decimal places |
| **buffer** | `{"type": "buffer", "structure": [...]}` | Parse structured binary data |
| **when** | `{"type": "when", "if": "v===0", "then": null, "else": {...}}` | Conditional transform |
| **ne** | `{"type": "ne", "compare": 0, "value": true}` | Not-equal comparison → boolean |

#### Transform Chain Example

```json
{
  "transform": {
    "from": [
      { "type": "scale", "value": 0.01 },
      { "type": "offset", "value": -273.15 },
      { "type": "clamp", "min": -40, "max": 80 },
      { "type": "precision", "digits": 2 }
    ],
    "to": [
      { "type": "precision", "digits": 2 },
      { "type": "offset", "value": 273.15 },
      { "type": "scale", "value": 100 }
    ]
  }
}
```

### 3.6 Configure Block

Declares device initialization: bindings, reporting, reads.

```json
{
  "configure": {
    "bindings": [
      { "cluster": "genPowerCfg", "target": "coordinator" },
      { "cluster": "hvacThermostat", "target": "coordinator" }
    ],
    "reporting": [
      {
        "cluster": "genPowerCfg",
        "attribute": "batteryPercentageRemaining",
        "min": "1_HOUR",
        "max": "MAX",
        "change": 10
      },
      {
        "cluster": "hvacThermostat",
        "attribute": "localTemperature",
        "min": "10_SECONDS",
        "max": "1_HOUR",
        "change": 50
      }
    ],
    "reads": [
      { "cluster": "genPowerCfg", "attributes": ["batteryVoltage"] },
      { "cluster": "genBasic", "attributes": ["modelId", "swBuildId"] }
    ],
    "magicPacket": true,
    "powerSource": "Mains (single phase)"
  }
}
```

### 3.7 Custom Clusters

Manufacturer-specific cluster definitions or extensions.

#### New Cluster

```json
{
  "customClusters": [
    {
      "name": "manuSpecificPhilips2",
      "ID": "0xFC03",
      "manufacturerCode": "0x100B",
      "attributes": [
        {
          "name": "state",
          "ID": "0x0002",
          "type": "OCTET_STR",
          "access": "rw",
          "max": 255
        }
      ],
      "commands": [
        {
          "name": "multiColor",
          "ID": "0x00",
          "direction": "client_to_server",
          "parameters": [
            { "name": "data", "type": "BUFFER" }
          ]
        }
      ]
    }
  ]
}
```

#### Extending Standard Cluster

```json
{
  "customClusters": [
    {
      "name": "genOnOff",
      "ID": "0x0006",
      "extend": true,
      "attributes": [
        {
          "name": "tuyaBacklightSwitch",
          "ID": "0x5000",
          "type": "ENUM8",
          "access": "rw"
        }
      ],
      "commands": [
        {
          "name": "tuyaCountdown",
          "ID": "0xF0",
          "direction": "client_to_server",
          "parameters": [{ "name": "data", "type": "BUFFER" }]
        }
      ]
    }
  ]
}
```

**Key difference:** `"extend": true` — runtime merges into existing standard cluster. Without it — creates a new cluster.

#### ZCL Data Types

| Type Code | ZCL Data Type |
|-----------|---------------|
| 0x10 | BOOLEAN |
| 0x18 | BITMAP8 |
| 0x20 | UINT8 |
| 0x21 | UINT16 |
| 0x23 | UINT32 |
| 0x28 | INT8 |
| 0x29 | INT16 |
| 0x2B | INT32 |
| 0x30 | ENUM8 |
| 0x31 | ENUM16 |
| 0x39 | SINGLE_PREC |
| 0x3A | DOUBLE_PREC |
| 0x41 | OCTET_STR |
| 0x42 | CHAR_STR |

#### Access Flags

| Flag | Meaning |
|------|---------|
| r | Readable |
| w | Writable |
| rw | Readable and writable |
| rwp | Readable, writable, reportable |

### 3.8 State Buffers

For devices that send multiple related datapoints that must be cached and published together.

```json
{
  "type": "datapoints",
  "protocol": "tuya",
  "stateBuffer": {
    "id": "pj1203a_channel_a",
    "strategy": "accumulate",
    "flush": {
      "when": "allPresent",
      "required": ["power_a", "current_a", "power_factor_a", "energy_flow_a"],
      "timeoutMs": 5000
    }
  },
  "datapoints": [
    { "dp": 101, "name": "power_a", "stateBuffer": "pj1203a_channel_a" },
    { "dp": 102, "name": "current_a", "stateBuffer": "pj1203a_channel_a" },
    { "dp": 103, "name": "power_factor_a", "stateBuffer": "pj1203a_channel_a" },
    { "dp": 104, "name": "energy_flow_a", "stateBuffer": "pj1203a_channel_a" }
  ]
}
```

**Flush strategies:**

| Strategy | Behavior |
|----------|----------|
| accumulate | Collect values until flush condition met |
| latest | Keep latest value, flush on timer |
| debounce | Wait for quiet period, then flush |

### 3.9 Handlers (Escape Hatch)

For complex cases not expressible declaratively.

```json
{
  "handlers": [
    {
      "ref": "philips.effectWithDeferredBrightness",
      "params": { "delayMs": 1000 },
      "description": "Effects reset brightness on activation, so send brightness AFTER effect as separate command"
    },
    {
      "ref": "ikea.restoreReportingOnAnnounce",
      "description": "IKEA bulbs lose reporting config on power cycle"
    },
    {
      "ref": "tuya.energyMeterSignedPower",
      "params": { "channels": ["a", "b"], "seqInc": 256 }
    }
  ]
}
```

Each handler is implemented once per target language in the runtime library.

### 3.10 White Label

```json
{
  "whiteLabel": [
    {
      "model": "929003809201",
      "vendor": "Philips",
      "description": "Hue White and Color Ambiance GU10 (Centura - Silver)",
      "identifiersOverride": {
        "zigbeeModel": ["929003809201"]
      }
    },
    {
      "model": "12239",
      "vendor": "EGLO",
      "description": "EGLO Hue-compatible GU10"
    }
  ]
}
```

---

## 4. Handler Registry — Complete Catalog

### 4.1 Tuya Handlers

| Handler ID | Description | Params | Complexity |
|------------|-------------|--------|------------|
| `tuya.queryOnDeviceAnnounce` | Send dataQuery on device announce | — | Low |
| `tuya.energyMeterSignedPower` | Multi-channel power with seq tracking, signed power computation | `{channels: string[], seqInc: number}` | High |
| `tuya.threshold_2` | Parse structured buffer with 2 alarm blocks | — | Medium |
| `tuya.threshold_3` | Parse structured buffer with 3 alarm blocks | — | Medium |
| `tuya.threshold_4` | Parse structured buffer with 4 alarm blocks | — | Medium |
| `tuya.threshold_5` | Parse structured buffer with 5 alarm blocks | — | Medium |
| `tuya.threshold_6` | Parse structured buffer with 6 alarm blocks | — | Medium |
| `tuya.threshold_7` | Parse structured buffer with 7 alarm blocks | — | Medium |
| `tuya.threshold_8` | Parse structured buffer with 8 alarm blocks | — | Medium |
| `tuya.thermostatSchedule` | Parse 12-byte weekly schedule | — | Medium |
| `tuya.inchingSwitch` | Multi-endpoint inching configuration | — | Medium |
| `tuya.TV02SystemMode` | TV02 thermostat system mode with special DP | — | Medium |
| `tuya.coverPosition` | Cover position with invert support | `{invert: boolean}` | Low |
| `tuya.coverAction` | Cover action (open/close/stop) parsing | — | Low |

### 4.2 Philips Handlers

| Handler ID | Description | Params | Complexity |
|------------|-------------|--------|------------|
| `philips.effectWithDeferredBrightness` | Effect resets brightness → defer brightness command | `{delayMs: number}` | High |
| `philips.hueNativeControl` | Atomic Philips2 commands for state/brightness/color | — | High |

### 4.3 IKEA Handlers

| Handler ID | Description | Params | Complexity |
|------------|-------------|--------|------------|
| `ikea.batteryPercentageDivision` | Divide battery % by 2 for firmware < 2.4.x | — | Medium |
| `ikea.restoreReportingOnAnnounce` | Reconfigure reporting after power cycle | — | Medium |
| `ikea.freezeTracking` | Track IKEA light freeze state across commands | — | High |
| `ikea.onLevelRestore` | Restore onLevel attribute on announce | — | Low |
| `ikea.remoteBindingByFirmware` | Bind to coordinator for FW >= 2.3.75, else group | — | Medium |

### 4.4 Xiaomi Handlers

| Handler ID | Description | Params | Complexity |
|------------|-------------|--------|------------|
| `lumi.buffer2DataObject` | Parse Xiaomi buffer [index, type, value] format | — | High |
| `lumi.numericAttributes2Payload` | Map Xiaomi attribute indices to properties | — | High |

---

## 5. Real Device Examples

### 5.1 Simple: IKEA TRADFRI Bulb

```json
{
  "$schema": "https://zigbee2mqtt.io/schemas/zhdf-v1.json",
  "device": {
    "model": "LED1545G12",
    "vendor": "IKEA of Sweden",
    "description": "TRADFRI bulb E26/E27, white spectrum, globe, opal, 980 lm",

    "identifiers": {
      "zigbeeModel": ["TRADFRI bulb E27 WS opal 980lm"]
    },

    "capabilities": [
      {
        "type": "composite",
        "name": "light",
        "features": [
          { "name": "state", "type": "binary", "access": "all", "valueOn": "ON", "valueOff": "OFF",
            "binding": { "cluster": "genOnOff", "attribute": "onOff" } },
          { "name": "brightness", "type": "numeric", "access": "all", "valueMin": 0, "valueMax": 254,
            "binding": { "cluster": "genLevelCtrl", "attribute": "currentLevel" } },
          { "name": "color_temp", "type": "numeric", "access": "all", "unit": "mired", "valueMin": 250, "valueMax": 454,
            "binding": { "cluster": "lightingColorCtrl", "attribute": "colorTemperature" } }
        ]
      },
      { "type": "identify", "isSleepy": false }
    ],

    "handlers": [
      { "ref": "ikea.restoreReportingOnAnnounce" },
      { "ref": "ikea.batteryPercentageDivision" }
    ],

    "options": ["transition"],

    "whiteLabel": [
      { "model": "LED1545G12", "vendor": "INGO", "description": "INGO bulb E27 WS" }
    ]
  }
}
```

### 5.2 Medium: Tuya Temperature Sensor

```json
{
  "$schema": "https://zigbee2mqtt.io/schemas/zhdf-v1.json",
  "device": {
    "model": "ZTH01",
    "vendor": "Tuya",
    "description": "Temperature and humidity sensor",

    "identifiers": {
      "fingerprint": [{ "modelID": "TS0601", "manufacturerName": "_TZE200_yjjdcqsq" }]
    },

    "capabilities": [
      {
        "type": "datapoints",
        "protocol": "tuya",
        "datapoints": [
          { "dp": 1, "name": "temperature", "access": "state_get", "unit": "°C",
            "transform": { "from": [{ "type": "scale", "value": 0.1 }] } },
          { "dp": 2, "name": "humidity", "access": "state_get", "unit": "%",
            "transform": { "from": [{ "type": "scale", "value": 0.1 }] } },
          { "dp": 4, "name": "battery", "access": "state_get", "unit": "%" }
        ]
      }
    ],

    "configure": {
      "magicPacket": true
    },

    "handlers": [
      { "ref": "tuya.queryOnDeviceAnnounce" }
    ],

    "whiteLabel": [
      { "model": "SNTH002", "vendor": "Moes", "description": "Moes temperature sensor" }
    ]
  }
}
```

### 5.3 Complex: Philips Hue Color Bulb

```json
{
  "$schema": "https://zigbee2mqtt.io/schemas/zhdf-v1.json",
  "device": {
    "model": "9290012573A",
    "vendor": "Philips",
    "description": "Hue white and color ambiance E26/E27/E14",

    "identifiers": {
      "zigbeeModel": ["LCT001", "LCT002", "LCT003", "LCT007", "LCT010", "LCT011", "LCT012", "LCT014", "LCT015", "LCT016", "LCT024", "LLC001", "LLC002", "LLC003", "LLC004", "LLC005", "LLC006", "LLC010", "LLC011", "LLC012", "LLC013", "LWG001", "LWG004", "LWV001", "LWW001"]
    },

    "customClusters": [
      {
        "name": "manuSpecificPhilips2",
        "ID": "0xFC03",
        "manufacturerCode": "0x100B",
        "attributes": [
          { "name": "state", "ID": "0x0002", "type": "OCTET_STR", "access": "rw" }
        ],
        "commands": [
          { "name": "multiColor", "ID": "0x00", "direction": "client_to_server",
            "parameters": [{ "name": "data", "type": "BUFFER" }] }
        ]
      }
    ],

    "capabilities": [
      {
        "type": "composite",
        "name": "light",
        "features": [
          { "name": "state", "type": "binary", "access": "all", "valueOn": "ON", "valueOff": "OFF" },
          { "name": "brightness", "type": "numeric", "access": "all", "valueMin": 0, "valueMax": 254 },
          { "name": "color_temp", "type": "numeric", "access": "all", "unit": "mired", "valueMin": 153, "valueMax": 500 },
          { "name": "effect", "type": "enum", "access": "all",
            "lookup": { "off": 0, "candle": 1, "fire": 2, "colorloop": 3, "sunrise": 4, "sparkle": 5 } }
        ],
        "binding": { "cluster": "manuSpecificPhilips2", "attribute": "state" }
      }
    ],

    "handlers": [
      { "ref": "philips.effectWithDeferredBrightness" },
      { "ref": "philips.hueNativeControl" }
    ],

    "options": ["transition", "color_sync"],

    "ota": true,

    "meta": {
      "supportsEnhancedHue": true,
      "supportsHueAndSaturation": true
    }
  }
}
```

### 5.4 Complex: PJ-1203A Energy Meter (State Buffer)

```json
{
  "$schema": "https://zigbee2mqtt.io/schemas/zhdf-v1.json",
  "device": {
    "model": "PJ-1203A",
    "vendor": "Tuya",
    "description": "Bidirectional energy meter",

    "identifiers": {
      "fingerprint": [{ "modelID": "TS0601", "manufacturerName": "_TZE204_81yrt3lo" }]
    },

    "capabilities": [
      {
        "type": "datapoints",
        "protocol": "tuya",
        "stateBuffer": {
          "id": "pj1203a_channel_a",
          "strategy": "accumulate",
          "flush": { "when": "allPresent", "required": ["power_a", "current_a", "power_factor_a"] }
        },
        "datapoints": [
          { "dp": 1, "name": "energy", "access": "state", "unit": "kWh",
            "transform": { "from": [{ "type": "scale", "value": 0.01 }] } },
          { "dp": 6, "name": "voltage", "access": "state", "unit": "V",
            "transform": { "from": [{ "type": "scale", "value": 0.1 }] } },
          { "dp": 101, "name": "power_a", "access": "state", "unit": "W",
            "stateBuffer": "pj1203a_channel_a",
            "transform": { "from": [{ "type": "scale", "value": 0.1 }] } },
          { "dp": 102, "name": "current_a", "access": "state", "unit": "A",
            "stateBuffer": "pj1203a_channel_a",
            "transform": { "from": [{ "type": "scale", "value": 0.001 }] } },
          { "dp": 103, "name": "power_factor_a", "access": "state", "unit": "%",
            "stateBuffer": "pj1203a_channel_a",
            "transform": { "from": [{ "type": "scale", "value": 0.1 }] } }
        ]
      }
    ],

    "handlers": [
      { "ref": "tuya.energyMeterSignedPower", "params": { "channels": ["a", "b"], "seqInc": 256 } }
    ],

    "options": ["single_zero_remove"]
  }
}
```

### 5.5 Complex: IKEA Air Purifier (Custom Cluster)

```json
{
  "$schema": "https://zigbee2mqtt.io/schemas/zhdf-v1.json",
  "device": {
    "model": "STARKVIND",
    "vendor": "IKEA of Sweden",
    "description": "STARKVIND Air purifier",

    "identifiers": { "zigbeeModel": ["STARKVIND"] },

    "customClusters": [
      {
        "name": "manuSpecificIkeaAirPurifier",
        "ID": "0xFC7D",
        "manufacturerCode": "0x117C",
        "attributes": [
          { "name": "filterRunTime", "ID": "0x0000", "type": "UINT32", "access": "rw" },
          { "name": "replaceFilter", "ID": "0x0001", "type": "UINT8", "access": "rw" },
          { "name": "filterLifeTime", "ID": "0x0002", "type": "UINT32", "access": "rw" },
          { "name": "disableLed", "ID": "0x0003", "type": "BOOLEAN", "access": "rw" },
          { "name": "airQuality", "ID": "0x0004", "type": "UINT16", "access": "r" },
          { "name": "fanSpeed", "ID": "0x0005", "type": "UINT16", "access": "rw" },
          { "name": "fanMode", "ID": "0x0006", "type": "UINT16", "access": "rw" },
          { "name": "childLock", "ID": "0x0007", "type": "BOOLEAN", "access": "rw" },
          { "name": "particulateMatter25Measurement", "ID": "0x0008", "type": "UINT16", "access": "r" }
        ],
        "commands": []
      }
    ],

    "capabilities": [
      {
        "type": "enum",
        "name": "fan_mode",
        "access": "all",
        "binding": { "cluster": "manuSpecificIkeaAirPurifier", "attribute": "fanMode" },
        "lookup": { "off": 0, "auto": 1, "1": 10, "2": 20, "3": 30, "4": 40, "5": 50 }
      },
      {
        "type": "binary",
        "name": "child_lock",
        "access": "all",
        "valueOn": "ON",
        "valueOff": "OFF",
        "binding": { "cluster": "manuSpecificIkeaAirPurifier", "attribute": "childLock" }
      },
      {
        "type": "numeric",
        "name": "pm25",
        "access": "state_get",
        "unit": "µg/m³",
        "binding": { "cluster": "manuSpecificIkeaAirPurifier", "attribute": "particulateMatter25Measurement" }
      }
    ],

    "configure": {
      "bindings": [
        { "cluster": "manuSpecificIkeaAirPurifier", "target": "coordinator" }
      ],
      "reporting": [
        {
          "cluster": "manuSpecificIkeaAirPurifier",
          "attribute": "particulateMatter25Measurement",
          "min": "1_MINUTE",
          "max": "1_HOUR",
          "change": 1
        }
      ]
    }
  }
}
```

---

## 6. Code Generator Design

### 6.1 TypeScript Generator

**Input:** device.zhdf.json
**Output:** TypeScript module compatible with zigbee-herdsman-converters

**Mapping:**

| JSON Capability | Generated TypeScript |
|-----------------|---------------------|
| `numeric` (temperature) | `m.temperature()` |
| `numeric` (humidity) | `m.humidity()` |
| `binary` (occupancy) | `m.occupancy()` |
| `binary` (contact) | `m.iasZoneAlarm({zoneType: 'contact'})` |
| `composite` (light) | `m.light({colorTemp: {range: [153, 500]}, color: true})` |
| `composite` (climate) | `m.thermostat({setpoints: {...}})` |
| `datapoints` (tuya) | `tuya.modernExtend.tuyaBase({dp: true})` |
| handler ref | Vendor-specific extend wrapping |

### 6.2 Python Generator

**Input:** device.zhdf.json
**Output:** Python module compatible with zigpy

```python
class PhilipsLCA001(CustomDevice):
    class ManuSpecificPhilips2Cluster(CustomCluster):
        cluster_id = 0xFC03
        ep_attribute = "philips_manufacturer_specific"

        attributes = {
            0x0001: ("state", t.uint8_t),
        }

        server_commands = {
            0x0002: ("multiColor", (t.bytes,), False),
        }
```

### 6.3 C++ Generator

**Input:** device.zhdf.json
**Output:** C++ headers for ZigbeeTLc

```cpp
struct LightCapabilities {
    bool state;
    uint8_t brightness;
    uint16_t color_temp;
};

const ClusterBinding temperature_binding = {
    .cluster = Cluster::msTemperatureMeasurement,
    .attribute = 0x0000,
    .transform = Transform::scale(0.01f),
    .reporting = { .min = 10s, .max = 1h, .change = 100 },
};
```

---

## 7. Migration Strategy

### 7.1 Dual-Format Architecture

```
src/
├── devices/              # Existing TS definitions (untouched)
│   ├── philips.ts
│   ├── ikea.ts
│   └── ...
├── devices-json/         # New JSON definitions
│   ├── index.ts          # Auto-generated index
│   ├── philips/
│   │   ├── LED1545G12.zhdf.json
│   │   └── LCA001.zhdf.json
│   └── custom/
│       └── my-device.zhdf.json
└── lib/
    ├── jsonLoader.ts     # Load JSON → DefinitionWithExtend
    └── jsonCompiler.ts   # Compile JSON to internal format
```

### 7.2 Conflict Resolution

| Strategy | Behavior |
|----------|----------|
| `jsonOverrides` | JSON definition wins on zigbeeModel collision |
| `tsOverrides` | TS definition wins on zigbeeModel collision (default for safety) |
| `errorOnConflict` | Build fails on collision |

Default: `tsOverrides` — no existing devices break.

### 7.3 Migration Timeline

| Phase | Action | Coverage | Effort |
|-------|--------|----------|--------|
| **P0** | Implement JsonCompiler + JsonLoader | — | 1-2 weeks |
| **P1** | New devices in JSON only | ~5% | Ongoing |
| **P2** | Auto-convert simple modern extends → JSON | ~50% | Script |
| **P3** | Manual convert medium complexity | ~30% | Community |
| **P4** | Handlers for complex cases | ~10% | Core team |
| **P5** | Deprecate TS definitions | ~5% | Future |

### 7.4 Round-Trip Validation

For each JSON device:
1. Compile JSON → DefinitionWithExtend
2. Generate back to TypeScript
3. Compare behavior with original
4. If diff > threshold — mark as "needs review"

---

## 8. Validation

### 8.1 JSON Schema

Full JSON Schema in `schemas/zhdf-v1.json` validates:
- Required fields (model, vendor, description, identifiers)
- Valid capability types
- Valid transform types
- Binding references to known clusters/attributes
- Handler references exist in registry
- No property name collisions
- Reporting intervals in valid ranges
- Access levels match capability types

### 8.2 Semantic Validation

Beyond JSON Schema — additional checks:
- Transform chain has no cycles
- StateBuffer flush conditions achievable
- Composite binding covers all features
- Enum lookup contains all values
- Formula expressions syntactically valid

---

## 9. Coverage Analysis

### 9.1 Current Project Coverage

| Category | Share | Declarativity |
|----------|-------|---------------|
| Simple extends (light, onOff, battery, sensor) | ~50% | Fully declarative |
| Combined extends + options | ~25% | Declarative with params |
| Tuya DP mapping | ~10% | Declarative (DP → property) |
| Manual converters + configure | ~10% | Partially declarative |
| Complex stateful (PJ1203A, Philips effects, IKEA freeze) | ~5% | Requires imperative code |

### 9.2 Format Coverage Target

| Layer | Coverage | Mechanism |
|-------|----------|-----------|
| Pure declarative | ~85% | JSON capabilities + bindings + transforms |
| Declarative + handler refs | ~95% | + handler registry |
| Declarative + handlers + rawCode | 100% | + rawCode escape hatch |

---

## 10. Open Questions

1. **Expression syntax:** Expressions (e.g., `v * 2 + 1`) are moved to handler escape hatch. Simple cases covered by transform chains (scale + offset).

2. **Multi-endpoint devices:** Capability-level `endpoint` field + `deviceEndpoints` capability for multi-endpoint.

3. **Vendor-specific clusters:** Capability-level `customClusters` section.

4. **Backward compat:** TS definitions can be removed after Phase 5 when 100% coverage in JSON.

5. **Handler versioning:** How to handle handler API evolution across runtime library versions? (Proposed: semantic versioning in handler ref, e.g., `philips.effectWithDeferredBrightness@v2`)

---

## 11. Implementation Plan (High-Level)

### Stage 1: Foundation (1-2 weeks)
- JSON Schema definition
- JsonCompiler: parse JSON → internal AST
- JsonLoader: load from filesystem
- Code gen: JSON → TS (simple capabilities)
- Round-trip test: TS → JSON → TS

### Stage 2: Core Capabilities (2-3 weeks)
- All capability types (numeric, binary, enum, composite, action)
- Transform Engine (all types)
- Binding (cluster, attribute, command)
- Configure block
- Reporting configuration
- White label support

### Stage 3: Advanced (2-3 weeks)
- Tuya DP protocol
- Custom clusters
- State buffers
- Handler registry + 10 core handlers
- onEvent / lifecycle handlers

### Stage 4: Migration Tools (1-2 weeks)
- TS → JSON auto-converter (simple cases)
- Conflict resolution strategy
- CI validation for JSON files
- Documentation

### Stage 5: Runtime Libraries (Ongoing)
- Python runtime + generator
- C++ runtime + generator
- Java runtime + generator
