import mv from "mv";
import { moveFile, setDateOnFile } from "../utils/file-utils.js";
import { taskify } from "../task-manager/utils.js";

const moveFileAndSetDate = async (source: string, destination: string, moveOptions: mv.Options, date: Date) => {
  await moveFile(source, destination, moveOptions);
  await setDateOnFile(destination, date);
};

export const MoveFileSetDateTask = taskify(moveFileAndSetDate, {
  taskType: "move_file",
});
export type MoveFileSetDateTask = ReturnType<typeof MoveFileSetDateTask>;

export const isMoveFileSetDateTask = (task: any): task is MoveFileSetDateTask => task.taskType === "move_file";
