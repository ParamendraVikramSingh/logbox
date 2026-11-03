const client = require("../config/elasticsearch");

const WRITE_LOGS_INDEX = process.env.ELASTICSEARCH_WRITE_INDEX || "logs";

const createLogsIndex = async () => {
  try {
    const exists = await client.indices.exists({ index: WRITE_LOGS_INDEX });

    if (!exists) {
      await client.indices.create({
        index: WRITE_LOGS_INDEX,
        mappings: {
          properties: {
            timestamp: { type: "date" },
            level: { type: "keyword" },
            source: { type: "keyword" },
            service: { type: "keyword" },
            route: { type: "keyword" },
            method: { type: "keyword" },
            endpoint: { type: "keyword" },
            message: { type: "text" },
            statusCode: { type: "integer" },
            errorType: { type: "keyword" },
            traceId: { type: "keyword" },
            requestId: { type: "keyword" },
            deploymentId: { type: "keyword" },
            responseTime: { type: "integer" },
            environment: { type: "keyword" },
          },
        },
      });

      console.log(`Elasticsearch '${WRITE_LOGS_INDEX}' index created`);
    } else {
      console.log(`Elasticsearch '${WRITE_LOGS_INDEX}' index already exists`);
    }
  } catch (error) {
    console.error("Error creating Elasticsearch index:", error);
  }
};

module.exports = createLogsIndex;
