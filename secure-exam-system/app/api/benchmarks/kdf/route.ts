import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import path from "path";

/** GET /api/benchmarks/kdf — returns pre-generated KDF benchmark JSON */
export async function GET() {
  const filePath = path.resolve("tests/results/kdf-benchmark.json");
  if (!existsSync(filePath)) {
    return NextResponse.json(
      { error: "No KDF benchmark results found. Run: npm run bench:kdf" },
      { status: 404 }
    );
  }
  const data = JSON.parse(readFileSync(filePath, "utf-8"));
  return NextResponse.json(data);
}
