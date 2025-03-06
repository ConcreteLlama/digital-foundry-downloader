import { Button } from '@mui/material';
import { closeSnackbar, enqueueSnackbar, OptionsObject, SnackbarKey, VariantType } from 'notistack';


type SnackbarActionButtonProps = {
    text: string;
    onClick: (snackbarKey: SnackbarKey) => void;
}
const SnackbarActionButton = (props: SnackbarActionButtonProps & {
    snackbarKey: SnackbarKey;
}) => {
    return (
        <Button variant='text' color={'inherit'} onClick={() => props.onClick(props.snackbarKey)} size='small'>{props.text}</Button>
    );
}

type TriggerSnackbarOpts = OptionsObject & {
    actionButton?: SnackbarActionButtonProps | SnackbarActionButtonProps[],
}
export const triggerSnackbar = (message: string, snackbarProps: TriggerSnackbarOpts) => {
    const variant: VariantType = snackbarProps.variant || 'info';
    const snackbarActionButtons: SnackbarActionButtonProps[] = snackbarProps.actionButton ? Array.isArray(snackbarProps.actionButton) ? snackbarProps.actionButton : [snackbarProps.actionButton] : [
        {
            text: 'Dismiss',
            onClick: (key) => closeSnackbar(key)
        }
    ];
    enqueueSnackbar(message, {
        variant,
        autoHideDuration: 5000,
        action: (key) => (
            snackbarActionButtons.map((actionButton) => (
                <SnackbarActionButton
                    snackbarKey={key}
                    text={actionButton.text}
                    onClick={() => {
                        closeSnackbar(key);
                        actionButton.onClick(key);
                    }}
                />
            ))
        ),
        ...snackbarProps,
    });
};