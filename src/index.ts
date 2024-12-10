import type { API } from "homebridge";

import { ShellyHNTAccessory } from "./platformAccessory.js";
import { PLATFORM_NAME } from "./settings.js";

/**
 * This method registers the platform with Homebridge
 */
export default (api: API) => {
  api.registerAccessory(PLATFORM_NAME, ShellyHNTAccessory);
};
