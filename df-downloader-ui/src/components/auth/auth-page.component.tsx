import { ThumbnailBackgroundPage } from "../general/thumbnail-background-page.component";
import { AuthFormDialog } from "./auth-form-dialog.component";

export const AuthPage = () => {
  return (
    <ThumbnailBackgroundPage>
      <AuthFormDialog />
    </ThumbnailBackgroundPage>
  );
};
