const mysql = require('mysql');
const config = global.config;
const colors = global.colors;
const DbName = config.database.database;
const connection = mysql.createConnection({
    host: config.database.host,
    user: config.database.user,
    password: config.database.password,
    port: config.database.port,
});

async function checkSqlConnection() {
    console.info("[INFO] checkSqlConnection...");
    try {
        return await new Promise((resolve, reject) => {
            connection.connect((err) => {
                if (err) {
                    console.error(colors.red('[ERROR] checkSqlConnection failed!'));
                    return reject(false);
                } else {
                    connection._protocol._config.database = DbName;
                    return resolve(true);
                };
            });
        });
    } catch (error) {
        console.error(colors.red('[ERROR] ...checkSqlConnection - UNEXPECTED ERROR!'));
        return error;
    };
};

async function checkDatabase() {
    console.info("[INFO] checkDatabase...");
    try {
        return await new Promise((resolve, reject) => {
            const query = 'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?;';
            connection.query(query, [DbName], (error, results) => {
                if (error) {
                    console.error(colors.red('[ERROR] SQL SCHEMA_NAME failed!'));
                    return reject(false);
                } else {
                    if (results.length > 0) {
                        return resolve(true);
                    } else {
                        console.error(colors.red('[ERROR] SQL SCHEMA_NAME failed!'));
                        return reject(false);
                    };
                };
            });
        });
    } catch (error) {
        console.error(colors.red('[ERROR] ...checkDatabase - UNEXPECTED ERROR!'));
        return false;
    };
};

async function createDatabase() {
    console.info("[INFO] createDatabase...");
    try {
        return new Promise((resolve, reject) => {
            const query = 'CREATE DATABASE IF NOT EXISTS ??';
            connection.query(query, [DbName], (error, results) => {
                if (error) {
                    console.error(colors.red('[ERROR] ...CREATE DATABASE IF NOT EXISTS failed!'));
                    return reject(error);
                } else {
                    return resolve(results);
                };
            });
        });
    } catch (error) {
        console.error(colors.red('[ERROR] ...createDatabase - UNEXPECTED ERROR!'));
        return false;
    };
};

async function createTables() {
    console.info("[INFO] createTables...");
    try {
        return new Promise((resolve, reject) => {

            console.info("[INFO] ...CREATE TABLE IF NOT EXISTS USERS");
            let UsersTable = `CREATE TABLE IF NOT EXISTS USERS (
                Id int(11) NOT NULL AUTO_INCREMENT,
                UserName varchar(255) NOT NULL,
                PassWord varchar(255) NOT NULL,
                ApiKey varchar(255) NOT NULL,
                WebIf tinyint(1) NOT NULL DEFAULT 1,
                PRIMARY KEY (Id),
                UNIQUE KEY JobId (UserName)
            )`;

            connection.query(UsersTable, function (err, results, fields) {
                if (err) {
                    console.error(colors.red('[ERROR] ...CREATE TABLE IF NOT EXISTS USERS failed!'));
                    return reject(err);
                };

                console.info("[INFO] ...CREATE TABLE IF NOT EXISTS CLIENTS");
                let ClientsTable = `CREATE TABLE IF NOT EXISTS CLIENTS (
                    Id int(11) NOT NULL AUTO_INCREMENT,
                    Serial varchar(255) NOT NULL,
                    ApiKey varchar(255) NOT NULL,
                    StateId tinyint(1) DEFAULT 0,
                    HostName varchar(128) NOT NULL,
                    IpAddress varchar(15) NOT NULL,
                    Port SMALLINT UNSIGNED NOT NULL,
                    UseSSL BOOLEAN NOT NULL DEFAULT 0,
                    Fqdn varchar(255) DEFAULT '',
                    JobClassId int(11) DEFAULT 1,
                    PRIMARY KEY (Id),
                    UNIQUE KEY unique_serial (Serial)
                )`;

                connection.query(ClientsTable, function (err, results, fields) {
                    if (err) {
                        console.error(colors.red('[ERROR] ...CREATE TABLE IF NOT EXISTS CLIENTS failed!'));
                        return reject(err);
                    };

                    console.info("[INFO] ...CREATE TABLE IF NOT EXISTS JOB_CLASSES");
                    let JobClassesTable = `CREATE TABLE IF NOT EXISTS JOB_CLASSES (
                        Id int(11) NOT NULL AUTO_INCREMENT,
                        Name VARCHAR(255) NOT NULL,
                        MaxJobs int(11) default 5,
                        PRIMARY KEY (Id),
                        UNIQUE KEY unique_serial (Name)
                    )`;

                    connection.query(JobClassesTable, function (err, results, fields) {
                        if (err) {
                            console.error(colors.red('[ERROR] ...CREATE TABLE IF NOT EXISTS JOB_CLASSES failed!'));
                            return reject(err);
                        };

                        const AddDefaultJobClass = [
                            `INSERT IGNORE INTO JOB_CLASSES (Id, Name, MaxJobs) VALUES (1, 'Default', 5);`,
                        ];
                        AddDefaultJobClass.forEach((statement) => {
                            connection.query(statement, (err, results, fields) => {
                                if (err) {
                                    console.error(colors.red('[ERROR] ...CREATE DEFAULT JOB-CLASS failed!'));
                                    return reject(err);
                                };
                            });
                        });

                        console.info("[INFO] ...CREATE TABLE IF NOT EXISTS JOBS");
                        let JobsTable = `CREATE TABLE IF NOT EXISTS JOBS (
                        Id int(11) NOT NULL AUTO_INCREMENT,
                        StateId int(11) DEFAULT 1,
                        WorkerId int(11) DEFAULT 0,
                        Command varchar(255) DEFAULT NULL,
                        ScriptId int(11) DEFAULT 0,
                        WatchDog int(11) DEFAULT 0,
                        Pid int(11) DEFAULT 0,
                        ReturnCode int(11) DEFAULT NULL,
                        CreatedAt datetime DEFAULT NULL,
                        StartedAt datetime DEFAULT NULL,
                        FinishedAt datetime DEFAULT NULL,
                        PRIMARY KEY (Id)
                    )`;

                        connection.query(JobsTable, function (err, results, fields) {
                            if (err) {
                                console.error(colors.red('[ERROR] ...CREATE TABLE IF NOT EXISTS JOBS failed!'));
                                return reject(err);
                            };

                            console.info("[INFO] ...CREATE TABLE IF NOT EXISTS LOGGING");
                            let LoggingTable = `CREATE TABLE IF NOT EXISTS LOGGING (
                            Id int(11) NOT NULL AUTO_INCREMENT,
                            JobId int(11) NOT NULL,
                            StdOut longtext DEFAULT NULL,
                            PRIMARY KEY (Id),
                            UNIQUE KEY JobId (JobId)
                        )`;

                            connection.query(LoggingTable, function (err, results, fields) {
                                if (err) {
                                    console.error(colors.red('[ERROR] ...CREATE TABLE IF NOT EXISTS LOGGING failed!'));
                                    return reject(err);
                                };

                                console.info("[INFO] ...CREATE TABLE IF NOT EXISTS SCRIPTS");
                                let ScriptsTable = `CREATE TABLE IF NOT EXISTS SCRIPTS (
                                Id int(11) NOT NULL AUTO_INCREMENT,
                                Interpreter VARCHAR(64) DEFAULT "",
                                Name VARCHAR(255) NOT NULL,
                                Content TEXT DEFAULT "",
                                PRIMARY KEY (Id),
                                UNIQUE KEY JobId (Name)
                            )`;

                                connection.query(ScriptsTable, function (err, results, fields) {
                                    if (err) {
                                        console.error(colors.red('[ERROR] ...CREATE TABLE IF NOT EXISTS SCRIPTS failed!'));
                                        return reject(err);
                                    };

                                    const AddExampleScripts = [
                                        `INSERT IGNORE INTO SCRIPTS (Id, Interpreter, Name, Content) VALUES (1, '/bin/sh', 'example.sh', '#!/bin/bash\necho "$(date) - Hello World from sh!";');`,
                                        `INSERT IGNORE INTO SCRIPTS (Id, Interpreter, Name, Content) VALUES (2, '/usr/bin/php', 'example.php', '<?php\necho "Hello World from php!";\n?>');`,
                                        `INSERT IGNORE INTO SCRIPTS (Id, Interpreter, Name, Content) VALUES (3, '/usr/bin/node', 'example.js', '#!/usr/bin/env node\nconsole.log("Hello, World from node!");');`
                                    ];

                                    AddExampleScripts.forEach((statement) => {
                                        connection.query(statement, (err, results, fields) => {
                                            if (err) {
                                                console.error(colors.red('[ERROR] ...CREATE EXAMPLE SCRIPTS failed!'));
                                                return reject(err);
                                            };
                                        });
                                    });

                                    return resolve(true);

                                });
                            });
                        });
                    });
                });
            });
        });

    } catch (error) {
        console.error(colors.red('[ERROR] ...CREATE TABLES UNEXPECTED ERROR!'));
        return false;
    };
};

module.exports = {
    checkSqlConnection,
    checkDatabase,
    createDatabase,
    createTables,
    connection
};