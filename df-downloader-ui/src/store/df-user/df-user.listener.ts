import { DfUserInfo } from "df-downloader-common";
import { AppStartListening } from "../listener";
import { queryDfUserInfo } from "./df-user.actions";
import { addFetchListener } from "../utils";
import { API_URL } from "../../config";

export const startListeningDfUserInfo = (startListening: AppStartListening) => {
  // .optional() because a signed-out response is {success:true, data:undefined}
  // (JSON-serialized as a success envelope with no data field). Validating
  // against the bare DfUserInfo schema would make parseResponseBody throw for
  // that case, routing it to the query's `failed` handler - which leaves any
  // previously-cached userInfo in place, so a stale "signed in" state from an
  // earlier poll would never get cleared. Treating it as a valid success with
  // an undefined payload lets the reducer reset userInfo to undefined.
  addFetchListener(startListening, queryDfUserInfo, DfUserInfo.optional(), () => [`${API_URL}/df-user`]);
};
