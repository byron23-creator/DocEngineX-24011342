FROM postgres:15-alpine

# Copy the init script into the entrypoint directory so it runs on first start
COPY init.sql /docker-entrypoint-initdb.d/init.sql
