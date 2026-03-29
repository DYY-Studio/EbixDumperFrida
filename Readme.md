# EbixDumperFrida

本项目仅供编程交流学习使用，请勿挪作他用。

**本项目目前仅支持 iOS(Jailbroken) / macOS(Apple Silicon)**

直接使用 EBookJapan 的 `EBIWrapperKit.framework` 实现EBIX内部文件导出

**现在只是一个毛坯房，并没有前端**

## Preview！
* 文件直接dump到`Library/DumpedBooks`下
* 生命周期控制可能有问题

## 支持格式
* EBIX (EBI)
  * 已验证：`HVQBOOK`
  * 如果原始图像是加密/封装JPEG，则直接输出JPEG
  * 如果原始图像是专有格式HVQ5或其他，则使用UIKit转换为PNG
* EBIX (LVF)
  * 已验证：`EPFA`
  * 直接保留原始文件结构DUMP

## 环境要求
* App端
  * 已越狱的iOS设备
    * 安装了frida-server
  * 搭载Apple Silicon的macOS设备（推荐）
    * 使用PlayCover运行EBookJapan
  * vphone-cli 
    * 未测试，那为什么不直接用PlayCover
  * 未越狱的iOS设备
    * 未测试，目前版本直接dump到沙盒里，没法取出
    * 注入frida-gadget
* 控制端
  * Python 3
  * 安装了frida, frida-tools

## 当前使用方法
* 直接操作
  * 在index.ts末尾换行加个`dumpall()`
  * 用frida CLI手动挂载，一Attach就开始dump
* RPC操作
  * `search()`
    * 返回`Library/Book`下扫描到的所有`.ebix`文件路径
  * `dump(filePath: string)`
    * 将指定文件dump
  * `dumpall()`
    * 执行`search`
    * 将扫描到的所有文件全部dump

## ToDo
- [ ] 给活人用的前端
- [ ] 更多格式兼容
- [ ] LVF2EPUB

## 许可证
MIT