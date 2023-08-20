const crypto = require('crypto')
const os = require('os');
const networkInterfaces = os.networkInterfaces();
const fs = require('fs');

const config = global.config;
const colors = global.colors;

/**
 * 
 * @returns boolean;
 */
async function VerifyConfig() {
    return new Promise(async (resolve, reject) => {

        /**
         * ✅ APP
         */

        // 👉 Verify SSL;
        if (config.app.use_ssl !== true && config.app.use_ssl !== false) {
            console.error(colors.red('[ERROR] Config "app" -> "use_ssl" is not a boolean value! Possible quotes?'));
            return reject(false);
        };

        // 👉 Verify Domain;
        if (config.app.use_ssl == true) {
            const domainRegex = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            const domain = config.ssl.domain;

            if (domain.startsWith("http://") || domain.startsWith("https://")) {
                console.error(colors.red('[ERROR] Config "ssl" -> "domain" starts with "http://" or "https://"! Remove the prefix!'));
                return reject(false);
            };

            if (!domainRegex.test(domain)) {
                console.error(colors.red('[ERROR] Config "app" -> "use_ssl" need a valid "ssl" -> "domain"!'));
                return reject(false);
            };

        };

        // 👉 Verify Port;
        if (!Number.isInteger(config.app.port) || config.app.port <= 0) {
            console.error(colors.red('[ERROR] Config "app" -> "port" is not a positive integer'));
            return reject(false);
        };

        /**
         * ✅ SSL
         */

        // 👉 Verify certfile;
        if (config.app.use_ssl == true) {
            try {
                await fs.promises.access(config.ssl.cert, fs.constants.F_OK);
            } catch (err) {
                console.error(colors.red('[ERROR] Config "ssl" -> "cert" -> File not found!'));
                return reject(false);
            };
        };

        // 👉 Verify keyfile;
        if (config.app.use_ssl == true) {
            try {
                await fs.promises.access(config.ssl.key, fs.constants.F_OK);
            } catch (err) {
                console.error(colors.red('[ERROR] Config "ssl" -> "key" -> File not found!'));
                return reject(false);
            };
        };

        /**
         * ✅ DATABASE
         */

        // ❌ ToDo:

        return resolve(true);

    }).catch(error => {
        return reject(false);
        //console.error('Unhandled Promise Rejection:', error);
    });

};

/**
 * 
 * @returns Network Details (iface);
 */
async function GetNetworkDetails() {
    console.log("[FUNC] GetNetworkDetails...");
    try {
        return new Promise((resolve, reject) => {
            for (const interfaceKey in networkInterfaces) {
                const interface = networkInterfaces[interfaceKey];
                for (const iface of interface) {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        iface.hostname = os.hostname();
                        iface.clientid = crypto.createHash('md5').update(iface.mac + "-" + iface.address + "-" + os.hostname()).digest("hex");
                        return resolve(iface);
                    };
                };
            };
        });
    } catch (error) {
        return false;
    };
};

/**
 * 
 * @returns Random apikey;
 */
async function generateRandomApiKey() {
    try {
        return await new Promise((resolve, reject) => {
            const randomBytes = crypto.randomBytes(10);
            const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*()_-+=<>?';
            let randomApiKey = '';
            const usernameLength = 15;
            for (let i = 0; i < usernameLength; i++) {
                const randomIndex = Math.floor(Math.random() * characters.length);
                randomApiKey += characters[randomIndex];
            };
            return resolve(randomApiKey);
        });
    } catch (error) {
        return false;
    };
};

module.exports = {
    VerifyConfig,
    GetNetworkDetails,
    generateRandomApiKey
};