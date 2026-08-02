const fs = require("fs");
const path = require("path");

const schemaPath = "c:\\Users\\Akshat\\Downloads\\ERP\\prisma\\schema.prisma";
const content = fs.readFileSync(schemaPath, "utf-8");
const lines = content.split("\n");

console.log("Occurrences of dateOfBirth in schema.prisma:");
lines.forEach((line, index) => {
  if (line.includes("dateOfBirth")) {
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
});
