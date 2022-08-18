export enum LogLevel {
    ERROR = 1,
    WARN = 2,
    INFO = 3,
    VERBOSE = 4,
    DEBUG = 5,
    SILLY = 6
}

export class Logger {
    constructor(public level: LogLevel) {

    }

    isLoggable(level: LogLevel) {
        return level <= this.level
    }

    log(level: LogLevel, ...toLog: any[]) {
        if (!this.isLoggable(level)) {
            return
        }
        let llString
        let logFn = console.log
        if (level === LogLevel.WARN) {
            llString = 'WARNING'
            level = LogLevel.WARN
            logFn = console.warn
        } else if (level === LogLevel.ERROR) {
            llString = 'ERROR'
            logFn = console.error
        }
        logFn(`[${new Date().toISOString()}] ${llString ? llString : ''}`, ...toLog)
    }
}