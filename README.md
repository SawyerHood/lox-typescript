# lox-typescript

This is a Typescript implementation of the Lox language tree-walking interpreter from Bob Nystrom's book [Crafting Interpreters](https://www.craftinginterpreters.com/).
I wrote this implementation while following along with the book mainly because the overhead of translating to TS made me pay a bit more attention
to the examples rather than just copy and pasting the Java source. Because I wrote this while following along with the book, it isn't the most
idiomatic typescript I've ever written. One major key difference this implementation and jlox is the AST. I used tagged unions and POJOs
rather than using code generation to make a visitor which makes walking an the AST a bit cleaner. 

## Running

```
git clone git@github.com:SawyerHood/lox-typescript.git
cd lox-typescript
yarn
# You can use `yarn start ${filename}` to run a file
# yarn start opens the repl
yarn start
```

# Lox Example

```js
fun addPair(a, b) {
  return a + b;
}

fun identity(a) {
  return a;
}

print identity(addPair)(1, 2); // Prints "3".
```
