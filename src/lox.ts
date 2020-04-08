import {readFileSync} from 'fs'
import readline from 'readline'
import Scanner from './Scanner'
import {setHadError} from './Error'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

function main(args: string[]) {
  if (args.length > 1) {
    console.log('usage: node lox.js [script]')
    return
  } else if (args.length === 1) {
    runFile(args[0])
  } else {
    runPrompt()
  }
}

function runFile(path: string) {
  const str = readFileSync(path, {encoding: 'utf-8'})
  run(str)
}

function runPrompt() {
  rl.setPrompt('>')
  rl.prompt()
  rl.on('line', (input) => {
    run(input)
    setHadError(false)
    rl.prompt()
  })
}

function run(source: string) {
  const scanner = new Scanner(source)
  const tokens = scanner.scanTokens()

  for (const token of tokens) {
    console.log(token)
  }
}

main(process.argv.slice(2))
