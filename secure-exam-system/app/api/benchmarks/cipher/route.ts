import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import path from "path";

/** GET /api/benchmarks/cipher — returns pre-generated cipher benchmark JSON */
export async function GET() {
  const filePath = path.resolve("tests/results/cipher-benchmark.json");
  if (!existsSync(filePath)) {
    return NextResponse.json(
      { error: "No cipher benchmark results found. Run: npm run bench:cipher" },
      { status: 404 }
    );
  }
  const data = JSON.parse(readFileSync(filePath, "utf-8"));
  return NextResponse.json(data);
}
