#!/bin/sh
# Runs once, when the MariaDB volume is first created (docker-entrypoint-initdb.d).
# aklatone_app = what the API uses for every request: read and write rows only, no CREATE/ALTER/DROP/GRANT.
# The full-rights user (MARIADB_USER) is used only for migrations, backups and restores (DATABASE_ADMIN_URL).
set -eu
: "${DB_APP_PASSWORD:?DB_APP_PASSWORD is required}"
mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" <<SQL
CREATE USER IF NOT EXISTS 'aklatone_app'@'%' IDENTIFIED BY '${DB_APP_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`${MARIADB_DATABASE}\`.* TO 'aklatone_app'@'%';
FLUSH PRIVILEGES;
SQL
