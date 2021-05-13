export function argparse(argv: string[]) {
    return {
        argv: argv.filter(arg => !arg.startsWith("-")),
        options: new Map(
            process.argv.slice(2).flatMap((arg): [string, any][] => {
                if (arg.startsWith("--")) {
                    if (arg.includes("=")) {
                        const m = /^(--[^=]*)=([\s\S]*)$/.exec(arg)!
                        const name = m[1]
                        const value = m[2]
                        return [[name, value]]
                    }
                    return [[arg, true]]
                }
                if (arg[0] === "-") {
                    return Array.from(arg.slice(1), flag => ["-" + flag, true])
                }
                return []
            }))
    }
}
