# NoMake: 静态检查的构建工具

支持静态检查、补全的分布式多语言构建工具。

## 要求

1. [Deno](https://deno.com/)
2. 在项目根目录初始化 deno (`deno init`)，并创建 `build.ts` 中，输入以下代码：

```typescript
// 未来将使用 branch tag 来指定版本
import * as NM from 'https://raw.githubusercontent.com/thautwarm/nomakefile/main/mod.ts'
export { NM }

NM.target(
    {
        name: 'build',
        async build()
        {
            NM.Log.ok('Build Complete')
        }
    }
)

NM.makefile()
```

## 动机

0. 不强行引入构建相关的专业知识: 因此不使用 Makefile
1. 降低多语言 monorepo 构建、发布的技术难度与学习成本: 因此不使用 Makefile
2. 支持静态检查和智能补全覆盖的构建系统：因此不使用 Makefile
3. 支持分布式构建和安全权限管控：因此不使用 Makefile，且 Deno 具有优势
4. 支持将构建脚本拆分到项目各处，且不影响静态检查和智能补全：因此不使用 Bazel 或 Python
5. 避免在环境变量上追求过度引用透明：因此不使用 Makefile
6. 支持从代码托管平台 URL 导入自定义规则集：因此不使用 NodeJS/Bun

如何支持分布式构建:
1. 构建服务器不安装任何额外工具， 使用 Deno 将构建逻辑打包为目标操作系统/架构上的可执行文件，运行此可执行文件可在服务器上构建任意目标。
2. 构建服务器安装 Deno，拉取代码后，调用 `deno run` 构建任意目标。

## NoMake 特点

1. 只需掌握基本的 TS 编程就能上手工作
2. Unopinioned but powerful: 尽可能少地引入预设的构建概念，但提供常见的构建概念的可用实现
3. NoMake 规则集本身是一个 Deno 库，可以通过 url 直接导入模块
4. 用户可以在 GitHub 等位置发布其他构建规则集，以方便其他用户导入

## NoMake 功能

- [x] 操作系统、架构等平台相关操作 `NM.Platform`
- [x] 环境变量操作 `NM.Env`
- [x] 文件/路径操作 `NM.Path` (类似 Python `pathlib`)
- [ ] 仓库操作 `nomake.Repo`
- [x] 日志操作 `nomake.Log`
- [ ] C/C++ 工具链操作 `nomake.CC`
- [ ] .NET 工具链操作 `nomake.NET`
- [ ] Julia 工具链操作 `nomake.Julia`
- [ ] 开箱即用的分布式构建能力