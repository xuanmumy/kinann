var should = require("should");
var mathjs = require("mathjs");
var Optimizer = require("../src/Optimizer");

// mocha -R min --inline-diffs *.js
(typeof describe === 'function') && describe("Optimizer", function() {

    it("Optimizer.optimize(expr) returns memoized expression name", function() {
        var opt = new Optimizer();
        opt.optimize("2*(a+b)+1/(a+b)+sin(a+b)").should.equal("f2");
        should.deepEqual(opt.memo, {
            f0: "(a + b)",
            f1: "sin(f0)",
            f2: "2 * (f0) + 1 / (f0) + f1",
        });

        // re-optimization of expressions matching existing optimizations has no effect 
        opt.optimize("2*(a + b)+1/(a+b)+sin(a+b)").should.equal("f2");

        // optimizations accumulate
        opt.optimize("((a+b)*(b+c)+1/(a + exp(b+c)))").should.equal("f6");
        should.deepEqual(opt.memo, {
            f0: "(a + b)",                  // old
            f1: "sin(f0)",                  // old
            f2: "2 * (f0) + 1 / (f0) + f1", // old
            f3: "(b + c)",                  // new
            f4: "exp(f3)",                  // new
            f5: "(a + f4)",                 // new
            f6: "((f0) * (f3) + 1 / (f5))", // new
        });

        // vector optimizations are supported
        var opt = new Optimizer();
        should.deepEqual(
            opt.optimize(["(a+b)", "(b+c)", "3*(a+b)"]), ["f0", "f1", "f2"]
        );
        opt.memo.f2.should.equal("3 * (f0)");

        var opt = new Optimizer();
        opt.optimize("2").should.equal("f0");
        should.deepEqual(opt.optimize("((w0b0+w0r0c0*x0+w0r0c1*x1-yt0)^2+(w0b1+w0r1c0*x0+w0r1c1*x1-yt1)^2)/2"), "f4");
        should.deepEqual(opt.memo, {
            f0: "2",
            f1: "(w0b0 + w0r0c0 * x0 + w0r0c1 * x1 - yt0)",
            f2: "(w0b1 + w0r1c0 * x0 + w0r1c1 * x1 - yt1)",
            f3: "((f1) ^ 2 + (f2) ^ 2)",
            f4: "(f3) / 2",
        });
        var opt = new Optimizer();
        opt.optimize("a*(x+1)").should.equal("f1");
        opt.optimize("a*(x+1)+2").should.equal("f2");
        opt.optimize("a*(x+1)+3").should.equal("f3");
        should.deepEqual(opt.memo, {
            f0: "(x + 1)",
            f1: "a * (f0)",
            f2: "f1 + 2",
            f3: "f1 + 3",
        });
    });
    it("Optimizer.compile(fname) compiles Javascript memoization function", function() {
        var opt = new Optimizer();
        var scope = {
            a: 3,
            b: 5
        };
        opt.optimize("2*(a+b)+1/(a+b)").should.equal("f1");
        var f1 = opt.compile(); // memoize all currently optimized functions
        should.deepEqual(scope, {
            a: 3,
            b: 5,
        });
        f1(scope).should.equal(16.125);
        should.deepEqual(scope, {
            a: 3,
            b: 5,
            f0: 8,
            f1: 16.125,
            // f2,f3 not present
        });

        opt.optimize("floor(exp(a))").should.equal("f3"); // mathjs functions
        opt.optimize("(a+b)^a").should.equal("f4"); // non-Javascript operator

        var f3 = opt.compile(); // memoize all currently optimized functions 
        f3(scope).should.equal(512);
        should.deepEqual(scope, {
            a: 3,
            b: 5,
            f0: 8,
            f1: 16.125,
            f2: 20.085536923187668,
            f3: 20,
            f4: 512,
        });
    });
})
