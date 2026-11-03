const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const { GoogleGenerativeAI } = require("@google/generative-ai");

console.log("KEY EXISTS:", !!process.env.GEMINI_API_KEY);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function test() {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
    });

    const result = await model.generateContent("Say 'Gemini working'");
    const text = result.response.text();

    console.log(text);
  } catch (error) {
    console.error("FULL ERROR:");
    console.error(error);
  }
}

test();