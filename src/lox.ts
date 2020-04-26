import { readFileSync } from "fs"
import readline from "readline"
import Scanner from "./Scanner"
import { setHadError, getHadError } from "./Error"
import Parser from "./Parser"
import interpret from "./Interpreter"
import { Resolver } from "./Resolver"

function main(args: string[]) {
  if (args.length > 1) {
    console.log("usage: node lox.js [script]")
    return
  } else if (args.length === 1) {
    runFile(args[0])
  } else {
    runPrompt()
  }
}

function runFile(path: string) {
  const str = readFileSync(path, { encoding: "utf-8" })
  run(str)
}

function runPrompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  rl.setPrompt(">")
  rl.prompt()
  rl.on("line", (input) => {
    run(input)
    setHadError(false)
    rl.prompt()
  })
}

function run(source: string) {
  const scanner = new Scanner(source)
  const tokens = scanner.scanTokens()
  const parser = new Parser(tokens)

  const statements = parser.parse()

  if (getHadError() || !statements) {
    return
  }

  const resolver = new Resolver()
  resolver.resolveStatements(statements)

  if (getHadError()) {
    return
  }

  interpret(statements)
}

main(process.argv.slice(2))
