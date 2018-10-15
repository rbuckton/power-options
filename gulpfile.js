const gulp = require('gulp');
const del = require('del');
const mocha = require('gulp-mocha');
const istanbul = require('gulp-istanbul');
const { build } = require("./scripts/build");

let useDebug = true;
let useCoverage = false;
const tests = {
    main: "dist/tests",
    coverage: {
        thresholds: {
            global: 80
        }
    }
};

gulp.task("cover", () => useCoverage = true);
gulp.task("release", () => useDebug = false);
gulp.task("clean", () => del("dist"));
gulp.task("build:lib", () => build("src/lib", { debug: useDebug }));
gulp.task("build:tests", ["build:lib"], () => build("src/tests", { debug: useDebug }));
gulp.task("build", ["build:lib", "build:tests"]);
gulp.task("test:pre-test", ["build"], preTest);
gulp.task("test", ["test:pre-test"], test(tests));
gulp.task("watch", () => gulp.watch(["src/**/*"], ["test"]));
gulp.task("default", ["test"]);
gulp.task("accept-baselines:clean-reference", () => del("baselines/reference"));
gulp.task("accept-baselines", ["accept-baselines:clean-reference"], () => gulp
    .src("baselines/local/**/*")
    .pipe(gulp.dest("baselines/reference")));
gulp.task("prepublishOnly", ["clean", "release"], () => gulp.start("test"));

function preTest() {
    if (useCoverage) {
        return gulp.src(['out/lib/*.js', 'out/es5/*.js'])
            .pipe(istanbul())
            .pipe(istanbul.hookRequire());
    }
}

function test(opts) {
    return function () {
        var stream = gulp
            .src(opts.main, { read: false })
            .pipe(mocha({ reporter: 'dot' }));
        return useCoverage
            ? stream
                .pipe(istanbul.writeReports({ reporters: ["text", "html"] }))
                .pipe(istanbul.enforceThresholds(opts.coverage))
            : stream;
    };
}