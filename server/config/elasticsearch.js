require("dotenv").config();
const { Client } = require("@elastic/elasticsearch");

const client = new Client({
  node: process.env.ELASTICSEARCH_NODE || "http://localhost:9200",
  tls: {
    rejectUnauthorized: false, // safe for dev; remove in production with proper certs
  },
});

module.exports = client;
