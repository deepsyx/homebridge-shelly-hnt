const axios = require("axios");

module.exports = (api) => {
  api.registerAccessory("ShellyHNT", ShellyHNTAccessory);
};

class ShellyHNTAccessory {
  constructor(log, config, api) {
    this.log = log;
    this.log("Setup started");

    this.deviceData = null;

    this.api = api;

    this.name = config.name || "Shelly H&T";
    this.config = config;

    this.temperatureService = new api.hap.Service.TemperatureSensor(this.name);
    this.humidityService = new api.hap.Service.HumiditySensor(this.name);

    this.temperatureService
      .getCharacteristic(api.hap.Characteristic.CurrentTemperature)
      .onGet(this.getTemperature.bind(this));

    this.temperatureService
      .getCharacteristic(api.hap.Characteristic.StatusLowBattery)
      .onGet(this.getBatteryStatus.bind(this));

    this.humidityService
      .getCharacteristic(api.hap.Characteristic.CurrentRelativeHumidity)
      .onGet(this.getHumidity.bind(this));

    this.humidityService
      .getCharacteristic(api.hap.Characteristic.StatusLowBattery)
      .onGet(this.getBatteryStatus.bind(this));

    this.fetchData();

    setInterval(() => {
      this.fetchData();
    }, config.pollingInterval || 30000);

    this.log("Setup completed");
  }

  async fetchData() {
    try {
      const response = await axios.post(
        `${this.config.serverUrl}/device/status`,
        {
          id: this.config.deviceId,
          auth_key: this.config.authorizationKey,
        }
      );

      this.deviceData = response.data.data.device_status;

      const cloudEnabled =
        this.deviceData.cloud.enabled || this.deviceData.cloud.connected;

      if (!cloudEnabled) {
        this.log.error("Shelly Cloud for this device is not enabled!");
      }
    } catch (error) {
      this.log.error("Error fetching data from HTTP server:", error.message);
    }
  }

  async getBatteryStatus() {
    if (!this.deviceData) {
      throw new Error("Temperature data unavailable");
    }

    if (this.deviceData.bat && this.deviceData.bat.value < 10) {
      // support for first gen H&T
      return this.api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    }

    if (
      this.deviceData["devicepower:0"] &&
      this.deviceData["devicepower:0"].battery.percent < 10
    ) {
      // support for third gen H&T
      return this.api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    }

    return this.api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
  }

  async getTemperature() {
    if (!this.deviceData) {
      throw new Error("Temperature data unavailable");
    }

    if (this.deviceData.tmp) {
      // support for first gen H&T
      return this.deviceData.tmp.tC;
    }

    if (this.deviceData["temperature:0"]) {
      // support for third gen H&T
      return this.deviceData["temperature:0"].tC;
    }

    throw new Error("Device not supported");
  }

  async getHumidity() {
    if (!this.deviceData) {
      throw new Error("Humidity data unavailable");
    }

    if (this.deviceData.hum) {
      // support for first gen H&T
      return this.deviceData.hum.value;
    }

    if (this.deviceData["humidity:0"]) {
      // support for third gen H&T
      return this.deviceData["humidity:0"].rh;
    }

    throw new Error("Device not supported");
  }

  getServices() {
    return [this.temperatureService, this.humidityService];
  }
}
