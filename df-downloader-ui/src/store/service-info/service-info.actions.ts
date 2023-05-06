import { createQueryActions } from "../utils";
import { ServiceInfo } from "df-downloader-common";

export const queryServiceInfo = createQueryActions<void, ServiceInfo>("serviceInfo", "QUERY_SERVICE_INFO");
