import { ServiceInfo } from "df-downloader-common";
import { AppStartListening } from "../listener";
import { addFetchListener } from "../utils";
import { queryServiceInfo } from "./service-info.actions";
import { API_URL } from "../../config";

export const startListeningServiceInfo = (startListening: AppStartListening) => {
  addFetchListener(startListening, queryServiceInfo, ServiceInfo, () => [`${API_URL}/service-info`]);
};
