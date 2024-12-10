import axios from "axios";
import {
  API,
  AccessoryPlugin,
  Logging,
  Service,
  AccessoryConfig,
} from "homebridge";

type HNTFirstGenData = {
  tmp: { tC: number };
  hum: { value: number };
  bat: { value: number };
};

type HNTThirdGenData = {
  "temperature:0": { tC: number };
  "humidity:0": { rh: number };
  "devicepower:0": { battery: { percent: number } };
};

type DeviceData = HNTFirstGenData & HNTThirdGenData;

interface ShellyHNTConfig extends AccessoryConfig {
  serverUrl: string;
  deviceId: string;
  authorizationKey: string;
  pollingInterval?: number;
}

export class ShellyHNTAccessory implements AccessoryPlugin {
  private readonly log: Logging;
  private readonly config: ShellyHNTConfig;
  private readonly api: API;

  private deviceData: DeviceData | null = null;
  private readonly temperatureService: Service;
  private readonly humidityService: Service;

  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log;
    this.log("Setup started");

    this.deviceData = null;

    this.api = api;

    const name = config.name || "Shelly H&T";

    if (
      !("serverUrl" in config) ||
      !("deviceId" in config) ||
      !("authorizationKey" in config)
    ) {
      throw new Error(
        "Invalid configuration for ShellyHNTAccessory! Make sure serverUrl, deviceId and authorizationKey are provided"
      );
    }

    this.config = config as ShellyHNTConfig;

    this.temperatureService = new api.hap.Service.TemperatureSensor(name);
    this.humidityService = new api.hap.Service.HumiditySensor(name);

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

      this.deviceData = response.data.data.device_status as DeviceData;

      this.temperatureService
        .getCharacteristic(this.api.hap.Characteristic.CurrentTemperature)
        .updateValue(this.getTemperatureFromDeviceData(this.deviceData));

      this.humidityService
        .getCharacteristic(this.api.hap.Characteristic.CurrentRelativeHumidity)
        .updateValue(this.getHumidityFromDeviceData(this.deviceData));
    } catch (error) {
      this.log.error("Error fetching data from HTTP server:", error);
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

    if (this.deviceData["devicepower:0"]?.battery?.percent < 10) {
      // support for third gen H&T
      return this.api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    }

    return this.api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
  }

  private getTemperatureFromDeviceData(deviceData: DeviceData) {
    if (deviceData.tmp) {
      // support for first gen H&T
      return deviceData.tmp.tC;
    }

    if (deviceData["temperature:0"]) {
      // support for third gen H&T
      return deviceData["temperature:0"].tC;
    }

    throw new Error("Invalid response data shape");
  }

  async getTemperature() {
    if (!this.deviceData) {
      throw new Error("Temperature data unavailable");
    }

    return this.getTemperatureFromDeviceData(this.deviceData);
  }

  private getHumidityFromDeviceData(deviceData: DeviceData) {
    if (deviceData.hum) {
      // support for first gen H&T
      return deviceData.hum.value;
    }

    if (deviceData["humidity:0"]) {
      // support for third gen H&T
      return deviceData["humidity:0"].rh;
    }

    throw new Error("Invalid response data shape");
  }

  async getHumidity() {
    if (!this.deviceData) {
      throw new Error("Humidity data unavailable");
    }

    return this.getHumidityFromDeviceData(this.deviceData);
  }

  getServices() {
    return [this.temperatureService, this.humidityService];
  }
}
