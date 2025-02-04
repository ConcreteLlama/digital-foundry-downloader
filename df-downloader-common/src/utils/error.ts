export const errorToString = (error: any) => {
    if (typeof error === "string") {
        return error;
    }
    if (error.message) {
        return error.message;
    }
    return JSON.stringify(error);
};