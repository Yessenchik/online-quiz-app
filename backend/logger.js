const winston = require('winston');

// Define log formats
const logFormat = winston.format.combine(
    winston.format.colorize(),                // Add color to the output
    winston.format.timestamp(),               // Add timestamp to each log entry
    winston.format.printf(({ timestamp, level, message }) => {
        return `${timestamp} [${level}]: ${message}`;
    })
);

// Create the logger
const logger = winston.createLogger({
    level: 'info', // default logging level
    format: logFormat,
    transports: [
        // Log to combined.log for all logs of 'info' and higher
        new winston.transports.File({ filename: 'logs/combined.log' }),

        // Log to error.log for 'error' logs only
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),

        // Also log to the console in color (for development)
        new winston.transports.Console()
    ]
});

module.exports = logger;