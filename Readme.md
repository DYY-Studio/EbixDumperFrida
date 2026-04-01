# EbixDumperFrida

本项目仅供编程交流学习使用，请勿挪作他用。

**本项目目前仅支持 iOS(Jailbroken) / macOS(Apple Silicon)**

直接使用 EBookJapan 的 `EBIWrapperKit.framework` 实现EBIX内部文件导出

## 支持格式
* EBIX (EBI)
  * 已验证：`HVQBOOK`
  * 如果原始图像是加密/封装JPEG，则直接输出JPEG
  * 如果原始图像是专有格式HVQ5或其他，则使用UIKit转换为PNG
* EBIX (LVF)
  * 已验证：`EPFA`
  * 直接保留原始文件结构DUMP
  * 可以使用[LVF2EPUB](https://github.com/DYY-Studio/lvf2ePub)转换为标准ePub3文件

## 环境要求
* App端
  * 已越狱的iOS设备
    * 安装了`frida-server`
  * 搭载Apple Silicon的macOS设备（推荐）
    * 使用PlayCover运行EBookJapan
  * vphone-cli 
    * 未测试，那为什么不直接用PlayCover
  * 未越狱的iOS设备
    * 未测试
    * 注入`frida-gadget`并侧载
* 控制端
  * Python 3.8+
  * Node.js
  * ```shell
    pip install -r requirements.txt # 安装Python依赖
    cd script
    npm install # 安装Node.js包
    ```

## 当前使用方法
* 使用`decrypter.py`
  * 文件会保存到运行目录`/output`下
  * 默认操作为`dumpall`，请手动管理本地文件
  * ```shell
    # 启动应用

    # macOS/PlayCover
    python decrypter.py -n ebookjapan 
    # 或 jp.co.yahoo.ebookjapan 

    # iOS (USB Connection)
    python decrypter.py -U -N jp.co.yahoo.ebookjapan 
    ```
* RPC操作
  * `search()`
    * 返回`Library/Book`下扫描到的所有`.ebix`文件路径
  * `dump(filePath: string)`
    * 将指定文件dump
  * `dumpall()`
    * 执行`search`
    * 将扫描到的所有文件全部dump

## ToDo
- [x] 给活人用的前端
- [ ] 更多格式兼容
- [x] LVF2EPUB

## 许可证
MIT