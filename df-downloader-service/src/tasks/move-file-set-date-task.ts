import mv from "mv";
import { moveFile, pathIsEqual, setDateOnFile } from "../utils/file-utils.js";
import { taskify } from "../task-manager/utils.js";

const moveFileAndSetDate = async (source: string, destination: string, moveOptions: mv.Options, date?: Date) => {
  // Metadata injection can already have written the file straight to its
  // destination (see ContentManagementConfig.writeDirectToDestination), in
  // which case there is nothing to move - but the published date still needs
  // applying, so this stays a real step rather than being skipped entirely.
  if (!pathIsEqual(source, destination)) {
    await moveFile(source, destination, moveOptions);
  }
  if (date) {
    await setDateOnFile(destination, date);
  }
};

export const MoveFileSetDateTask = taskify(moveFileAndSetDate, {
  taskType: "move_file",
});
export type MoveFileSetDateTask = ReturnType<typeof MoveFileSetDateTask>;

export const isMoveFileSetDateTask = (task: any): task is MoveFileSetDateTask => task.taskType === "move_file";
