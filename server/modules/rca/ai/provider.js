const { GoogleGenerativeAI } = require("@google/generative-ai");

const getClient = () => {
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
};

const getModel = () => {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
};

module.exports = { getClient, getModel };