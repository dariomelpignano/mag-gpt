// Sample JavaScript function for demonstration
function calculateFibonacci(n) {
  if (n <= 1) return n;
  
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    let temp = a + b;
    a = b;
    b = temp;
  }
  return b;
}

// Example usage
console.log(calculateFibonacci(10)); // Output: 55

// Another function to demonstrate different concepts
function processArray(arr, callback) {
  return arr.map(callback).filter(item => item !== null);
}

// Sample data processing
const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const processed = processArray(numbers, num => num % 2 === 0 ? num * 2 : null);
console.log(processed); // Output: [4, 8, 12, 16, 20]

// Class example
class Calculator {
  constructor() {
    this.history = [];
  }
  
  add(a, b) {
    const result = a + b;
    this.history.push(`${a} + ${b} = ${result}`);
    return result;
  }
  
  getHistory() {
    return this.history;
  }
}

const calc = new Calculator();
calc.add(5, 3); // 8
calc.add(10, 20); // 30
console.log(calc.getHistory()); 