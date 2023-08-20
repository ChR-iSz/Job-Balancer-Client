const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const https = require("https");
const app = express();
const bodyParser = require('body-parser');
const json5 = require('json5');
const currentDir = __dirname;
const kill = require('tree-kill');

global.fs = require('fs');
global.colors = require('colors');

// Load Config;
const configPath = path.join(currentDir, 'config.jsonc');
const exampleConfigPath = path.join(currentDir, 'config.jsonc.example');
let config;

if (fs.existsSync(configPath)) {
    config = json5.parse(fs.readFileSync(configPath, 'utf8'));
} else {
    const exampleConfigContent = fs.readFileSync(exampleConfigPath, 'utf8');
    fs.writeFileSync(configPath, exampleConfigContent);
    config = json5.parse(exampleConfigContent);
    console.error(colors.red(`[ERROR] config.jsonc not found!\nI have create the 'config.jsonc' from 'config.jsonc.example' automatically for you.\nPlease edit now the 'config.jsonc' file and restart this process! By by, see you later...`));
    process.exit(); // 🛑 S T O P 🛑 //
};

global.config = config;
global.tools = require('./tools.js');
colors.enable();
app.use(bodyParser.json());

if (process.getuid() == 0) {
    console.error(colors.red('\n[ERROR] Starting Job-Balancer-Worker as root is not allowed!\n'));
    process.exit(); // 🛑 S T O P 🛑 //
};

console.log("");
console.log(colors.green('------------------------'));
console.log(colors.green('Job-Balancer-Client     '));
console.log(colors.green('Software Version: 0.0.1 '));
console.log(colors.green('Node type: Worker       '));
console.log(colors.green('------------------------'));
console.log("");

const database = require('./database.js');
var db = database.connection;
var ClientDbId;
var clientId;

async function main() {

    // Verify Config;
    if (! await tools.VerifyConfig()) {
        process.exit(); // 🛑 S T O P 🛑 //
    };

    // Generate temporary apikey;
    const randomApiKey = await tools.generateRandomApiKey();
    const api = [
        { id: 1, apikey: randomApiKey }
    ];

    // 🟡 Check Database connection;
    if (! await database.checkSqlConnection()) {
        console.error(colors.red('[ERROR] [checkSqlConnection] failed! Check your credentials in config.jsonc!'));
        process.exit(); // 🛑 S T O P 🛑 //
    };

    // 🟡 Check Database connection;
    if (! await database.checkDatabase()) {
        console.log(colors.yellow('[WARN] [checkDatabase] failed! Database not exist! Create new...'));

        // 🟡 Create database;
        if (! await database.createDatabase()) {
            console.error(colors.red('[ERROR] [createDatabase] failed! Database creation failed!'));
            process.exit(); // 🛑 S T O P 🛑 //
        };
    };

    try {
        db.changeUser({ database: config.database.database }, function (err) {
            if (err) throw err;
        });
    } catch (error) {
    }

    if (! await database.createTables()) {
        console.error(colors.red('[ERROR] [createTables] failed! Tables creation failed!'));
        process.exit(); // 🛑 S T O P 🛑 //
    };

    let NetworkDetails = await tools.GetNetworkDetails();
    let ipAddress = NetworkDetails.address;
    let macAddress = NetworkDetails.mac;
    let hostName = NetworkDetails.hostname;
    clientId = NetworkDetails.clientid;

    if (ipAddress && macAddress) {
        console.log('[INFO] Register me as available to the database...');
        let booleanValue;
        if (config.app.use_ssl === "true") {
            booleanValue = true;
        } else if (config.app.use_ssl === "false") {
            booleanValue = false;
        } else if (config.app.use_ssl === true || config.app.use_ssl === false) {
            booleanValue = config.app.use_ssl;
        } else {
            console.error("Invalid value for the boolean entry in the configuration.");
        };

        const ssl = booleanValue ? 1 : 0;

        const insertQuery = 'INSERT INTO CLIENTS (Serial, ApiKey, StateId, IpAddress, Port, HostName, UseSSL, Fqdn) VALUES (?, ?, 1, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE Serial = VALUES(Serial), ApiKey = ?, StateId = 1, IpAddress = VALUES(IpAddress), Port = VALUES(Port), UseSSL = ?, Fqdn = ?';
        db.query(insertQuery, [clientId, randomApiKey, ipAddress, config.app.port, hostName, ssl, config.ssl.domain, randomApiKey, ssl, config.ssl.domain], (error, result) => {
            if (error) {
                console.error('[ERROR] ' + error);
            } else {
                const newInsert = result.insertId; // Neue ID nach REPLACE
                const selectQuery = 'SELECT Id FROM CLIENTS WHERE Serial = ?';
                db.query(selectQuery, [clientId], (error, result) => {
                    if (error) {
                        console.error('[ERROR] ' + error);
                    } else {
                        const existingId = result[0].Id; // Vorhandene ID aus der Datenbank
                        ClientDbId = newInsert || existingId;
                    };
                });
            };
        });
    } else {
        console.error(colors.red('[ERROR] IpAddress or MacAddress not found! Exit!'));
        process.exit();
    };

    // Client-Status an den Server senden
    const StdOutToDb = (jobid, stdout) => {
        const updateQuery = 'INSERT INTO LOGGING (JobId, StdOut) VALUES (?, ?) ON DUPLICATE KEY UPDATE StdOut = CONCAT(StdOut, ? );';
        db.query(updateQuery, [jobid, stdout, stdout]);
    };

    app.post('/ping', (req, res) => {
        const { ApiKey } = req.body;
        if (randomApiKey && ApiKey && ApiKey == randomApiKey) {
            res.status(200).json({ result: true, message: 'pong' });
        } else {
            res.status(403).send();
        };
    });

    app.post('/executeJob', (req, res) => {
        const { JobId, ApiKey } = req.body;
        if (randomApiKey && ApiKey && ApiKey == randomApiKey) {
            console.log('[INFO] Job received -> JobId:', JobId);
            res.status(200).json({ result: true, message: 'Success received!' });
            const GetJob = 'SELECT Id, StateId, Command, ScriptId, WatchDog FROM JOBS WHERE Id = ? LIMIT 1;';
            db.query(GetJob, [JobId], (err, result) => {
                if (err) {
                    // ❌ ❌ TODO ❌ ❌
                    res.status(500).send('Unexpected error!');
                } else {
                    let command = result[0].Command;
                    let watchdog = result[0].WatchDog;

                    if (result[0].ScriptId && result[0].ScriptId > 0) {
                        // 👉 Script Job (get the content and save it as executable file);
                        let sql = 'SELECT Name, Content FROM SCRIPTS WHERE Id = ?;';
                        db.query(sql, [result[0].ScriptId], (err, script) => {
                            if (err) {
                                res.json({ result: false, message: 'Unexpected error!' });
                            } else {
                                const FilePath = path.join(__dirname, 'scripts', script[0].Name);
                                const FileContent = script[0].Content;
                                fs.writeFile(FilePath, FileContent, 'utf8', (err) => {
                                    if (err) {
                                        res.json({ result: false, message: "Error while saving the file." });
                                    } else {
                                        fs.chmod(FilePath, 0o755, (err) => {
                                            if (err) {
                                                res.status(500).send('Error while setting file permissions.');
                                            } else {
                                                runCommand(JobId, command, watchdog);
                                            }
                                        });
                                    };
                                });
                            };
                        });
                    } else {
                        // 👉 Normal Job;
                        runCommand(JobId, command, watchdog);
                    };
                };
            });
        } else {
            res.status(403).send();
        };
    });

    app.post('/killJob', (req, res) => {
        const { Id, Pid, ApiKey } = req.body;
        if (randomApiKey && ApiKey && ApiKey == randomApiKey) {
            console.log('[INFO] Kill Job -> Pid:', Pid);
            kill(Pid, 'SIGTERM', (err) => {
                if (err) {
                    console.log('[INFO] Killing Job failed!', [Id, Pid]);
                    res.status(500).json({ result: false, error: 'Error killing process.' });
                } else {
                    console.log('[INFO] Killing Job successfully!', [Id, Pid]);
                    res.status(200).json({ result: true, message: 'Process killed successfully.' });
                };
                const UpdateDatabase = 'UPDATE JOBS SET StateId = 5 WHERE Id = ?';
                db.query(UpdateDatabase, [Id], (err, result) => {
                    if (err) {
                        console.log('[ERROR] Update Job failed!', [Id, Pid]);
                    };
                    console.log('[INFO] Update Job sucessfully!', [Id, Pid]);
                });
            });
        } else {
            res.status(403).send();
        };
    });

    function runCommand(jobid, command, timeoutInSeconds) {
        command = command.trimStart();
        console.log(`[INFO] Start command: ${command}`);
        return new Promise((resolve, reject) => {
            const scriptDirectory = path.dirname(process.argv[1]);
            const childProcess = spawn(command, {
                shell: true,
                cwd: scriptDirectory + "/scripts",
            });
            const UpdateWorker = 'UPDATE JOBS SET StateId = 2, WorkerId = ?, Pid = ? WHERE Id = ?';
            db.query(UpdateWorker, [ClientDbId, childProcess.pid, jobid], (err, result) => {
                if (err) {
                    console.log("[ERROR] Update Job!" + err);
                };
            });

            let WatchdogTimer;
            if (timeoutInSeconds > 0) {
                WatchdogTimer = setTimeout(() => {
                    console.log(colors.yellow(`[INFO] Watchdog terminates the function because the specified maximum duration of the process has been reached!`));
                    childProcess.kill(); //childProcess.kill('SIGTERM');
                    clearTimeout(WatchdogTimer);
                    console.log(`UPDATE JOBS SET StateId = 6, ReturnCode = 0 WHERE Id = ${jobid}`);
                    const UpdateJob = 'UPDATE JOBS SET StateId = 6, ReturnCode = 0 WHERE Id = ?';
                    db.query(UpdateJob, [jobid], (err, result) => {
                        if (err) {
                            console.log("[ERROR] Update Job!" + err);
                        };
                        resolve();
                    });
                }, timeoutInSeconds * 1000);
            };

            childProcess.stdout.on('data', (data) => {
                //console.log(`[STDOUT] Debug: ${data}`);
                StdOutToDb(jobid, data);
            });

            childProcess.stderr.on('data', (data) => {
                //console.log(`[STDERR] Debug: ${data}`);
                StdOutToDb(jobid, data);
            });

            childProcess.on('close', (code) => {
                //console.log(`[INFO] Child process closed with code ${code}`);
                try {
                    clearTimeout(WatchdogTimer);
                } catch (error) {
                }
                resolve();
            });

            childProcess.on('exit', (code) => {
                console.log(`[INFO] Process exit with code ${code}`);
                try {
                    clearTimeout(WatchdogTimer);
                } catch (error) {
                }

                if (Number.isInteger(code)) {
                    console.log(`UPDATE JOBS SET StateId = 3, ReturnCode = ${code} WHERE Id = ${jobid}`);
                    const UpdateJob = 'UPDATE JOBS SET StateId = 3, ReturnCode = ? WHERE Id = ?';
                    db.query(UpdateJob, [code, jobid], (err, result) => {
                        if (err) {
                            console.log("[ERROR] Update Job!" + err);
                        };
                        resolve();
                    });
                };
            });
            childProcess.on('error', (code) => {
                console.error(`[ERROR] Fehler beim Ausführen des Befehls: ${err}`);
                const UpdateJob = 'UPDATE JOBS SET StateId = 4, ReturnCode = ? WHERE Id = ?';
                db.query(UpdateJob, [code, jobid], (err, result) => {
                    if (err) {
                        console.log("[ERROR] Update Job!" + err);
                    };
                    reject(err);
                });
            });
        });
    };

    // ✅ Start Worker;
    if (config.app.use_ssl && config.ssl.key && config.ssl.cert) {
        https.createServer({
            key: fs.readFileSync(config.ssl.key),
            cert: fs.readFileSync(config.ssl.cert)
        }, app).listen(config.app.port, () => {
            console.log(colors.green(`[INFO] Worker running *SECURE* on https://${NetworkDetails.address}:${config.app.port}`));
        });
    } else {
        app.listen(config.app.port, () => {
            console.log(colors.yellow(`\n[INFO] Worker running *INSECURE* on http://${NetworkDetails.address}:${config.app.port}`));
        });
    };
};

main();