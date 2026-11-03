const fs = require("fs");
async function test() {
  try {
    const response = await fetch("http://localhost:4000/logs/analytics?start=2026-04-01T00:00:00.000Z");
    const result = await response.json();
    fs.writeFileSync("out_analytics.json", JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(e);
  }
}
test();
