const path = require("path");
const fs = require("fs");

async function testWasm() {
  try {
    const wasmJsPath = path.join(
      __dirname,
      "../../assets",
      "pkg",
      "big_o_analyser.js"
    );
    console.log("Loading from:", wasmJsPath);

    const wasmModule = require(wasmJsPath);
    console.log("Module loaded successfully");
    console.log("Type:", typeof wasmModule);
    console.log("Keys:", Object.keys(wasmModule));
    console.log(
      "Functions:",
      Object.keys(wasmModule).filter((k) => typeof wasmModule[k] === "function")
    );

    // Try to call a function if it exists
    if (wasmModule.analyze_complexity) {
      console.log("Found analyze_complexity function");
    }
  } catch (error) {
    console.error("Test failed:", error);
  }
}

testWasm();
