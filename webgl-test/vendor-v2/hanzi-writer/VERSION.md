# Hanzi Writer 本機化版本紀錄

取得日期：2026-11-07（Asia/Taipei）。以 npm 於專案外暫存目錄安裝固定版本後複製，專案內不含 node_modules；執行時 `charDataLoader` 只讀 `vendor-v2/hanzi-writer/data/<字>.json`，不向 CDN 取任何東西。

## 程式（lib/）— MIT

| 項目 | 值 |
|---|---|
| 套件 | `hanzi-writer` |
| 版本 | 3.7.3（npm `--save-exact`） |
| 來源 | https://registry.npmjs.org/hanzi-writer/-/hanzi-writer-3.7.3.tgz |
| npm integrity | `sha512-fdOFrb1cXWL/pV/oplJkcdziCvjJzhhf+qoIBm5IpVGxPBZEu4eLB6ZG5RJDbKXyNbNlyx8oIpa3XrcUBcSXpg==` |
| 授權 | MIT，`lib/LICENSE`（Copyright (c) 2014 David Chanin） |
| 遊戲使用的建置 | `lib/dist/index.esm.js`（ESM，由 `<script type=module>` import）；UMD `lib/dist/hanzi-writer.js` 一併保留但未使用 |
| 預設 CDN loader | 原始碼 `dist/index.esm.js` 內 `defaultCharDataLoader` 指向 cdn.jsdelivr.net；本專案一律覆寫 `charDataLoader`，見 `webgl-test/game/writing-panel.js` |

### lib/ 檔案 SHA256

| 檔案 | SHA256 |
|---|---|
| `lib/COPYING.md` | `220344521c6e1a8b82c5d3a13dfc797be7e0785b2b61b0403eff02a5cbd61c59` |
| `lib/dist/hanzi-writer.js` | `92d74a0c05698f77e335ab97d5a64e105dec87a5eed29dd1f384b07176bfaff2` |
| `lib/dist/hanzi-writer.min.js` | `17b11a1e025b780cb518d49b30faacc770dfa7fbc387aa3876e3e5c1bd31e642` |
| `lib/dist/hanzi-writer.min.js.map` | `05c9e3fe2d269f06a131b90ad11129299c7c1a88e40b954f5a817256c384af30` |
| `lib/dist/index.cjs.js` | `11128a87de9c019208954eb1c0ed9d1b03ff9a043c734ed01d697a8e64b4a72d` |
| `lib/dist/index.cjs.js.map` | `219ff160dc88fb62042e69ba26d2e07ab59d102500447bfe2d9fcd59a6dcaaae` |
| `lib/dist/index.esm.js` | `3460735421e172f7f3ad0e02f3383f5f94849aee2f3365815cda02be06af95e0` |
| `lib/dist/index.esm.js.map` | `985f59dba23b0e058628d84f27b1425323104ef0fd734e8587bb14881dfbf948` |
| `lib/dist/types/hanzi-writer.d.ts` | `9c170706b676b99d12f3693367f01c7269908cd4c85f144461af1c3318e61a53` |
| `lib/dist/types/hanzi-writer.min.d.ts` | `9c170706b676b99d12f3693367f01c7269908cd4c85f144461af1c3318e61a53` |
| `lib/dist/types/index.cjs.d.ts` | `9c170706b676b99d12f3693367f01c7269908cd4c85f144461af1c3318e61a53` |
| `lib/dist/types/index.esm.d.ts` | `9c170706b676b99d12f3693367f01c7269908cd4c85f144461af1c3318e61a53` |
| `lib/LICENSE` | `7735d83cdf892c8db41c27103b42c89b4b63149770c1e08ae13cbbebb81da637` |
| `lib/package.json` | `b1f4523d73eeadfd05616f5f3c335252ec800544e66c9641c7a8f2d862b3194d` |
| `lib/README.md` | `a9f02e9e554889c5b021b16d114a9c36374b750f122d404f12db0f93ac2f8014` |

## 字形資料（data/）— Arphic Public License

| 項目 | 值 |
|---|---|
| 套件 | `hanzi-writer-data` |
| 版本 | 2.0.1（npm `--save-exact`） |
| 來源 | https://registry.npmjs.org/hanzi-writer-data/-/hanzi-writer-data-2.0.1.tgz |
| npm integrity | `sha512-nbQwM+MaryGoq7pBMIZLCd3lFq03nXuJuwku1+6UbjL58uU+9OULVcMkoNvNuJSoIV7f1bbPRfD4D/LQa5S7qg==` |
| 授權 | Arphic Public License，`data/ARPHICPL.TXT`（另附 `data/APL` 同文）；package.json `license: SEE LICENSE IN ARPHICPL.TXT` |
| 內容 | 整包複製，9575 個 `<字>.json`（每檔 `strokes[]` SVG path、`medians[][]`、`radStrokes[]`），原套件 `index.js`／`README.md`／`yarn.lock` 保留 |
| 題庫 84 字覆蓋 | 全部存在 |

### 第一課九字資料 SHA256

| 字 | 檔案 | SHA256 | strokes | medians |
|---|---|---|---:|---:|
| 拍 | `data/拍.json` | `e72d0a0c0a90d526395f2cb56ff77ef356907362940070694a059e2f6697dc70` | 8 | 8 |
| 手 | `data/手.json` | `7964eac3bced473343f5741f98fea3eb2dd842eecd57ec20b4369912570964a7` | 4 | 4 |
| 左 | `data/左.json` | `a5741d50aea9247117aee3a150b7707ddaf9193b94032e3616cff9415f9dc1ed` | 5 | 5 |
| 右 | `data/右.json` | `d2483a266cd756c8deb1e4523e54fee29270ad4eb87a3b2bf1d40f9eb68de0cf` | 5 | 5 |
| 你 | `data/你.json` | `21057a26cb5c1753ea710d503b759cc17948263501ffd76ef1737cb2b5d5f966` | 7 | 7 |
| 他 | `data/他.json` | `93c72a3fb00f00e9d7c3da8e2bf25e913bd3eba3c71eaafacc69f55891dc5625` | 5 | 5 |
| 也 | `data/也.json` | `b382d98d228813ea32074caf8fee764b136593b5094579f4c00b2dd407c38dd3` | 3 | 3 |
| 上 | `data/上.json` | `9eed5643ff92171f9bf1ae5d4b70d717f2a3fd6961f72e81c0245ce13523d865` | 3 | 3 |
| 下 | `data/下.json` | `34984a2541baae9132f32e3dfe758ca29df64829558dc5a1c553c3d3011da880` | 3 | 3 |

### 題庫 84 字資料 SHA256

| 字 | 課 | SHA256 |
|---|---:|---|
| 一 | 0 | `ed728673d86fb9aa559c5b150e59ffbee666b085d4a55597c524079a91ebc8ce` |
| 二 | 0 | `24d4225b8514e5b169f44230ba38169f63e9d9875f31b478457841114dbe1faa` |
| 三 | 0 | `917763e15ac14a5ece5067913da4156f3060f33ae0e172d3533275a494cec99c` |
| 四 | 0 | `8aa7b3e16a0c3f67fc4ed3b08c7f24e80b2e90d8f6ade512d20109a625bea3b9` |
| 五 | 0 | `c2d064e88c2acde1faecc4ff45f0d4ec7cd5889a3e4b7e8145019150ad6db7bd` |
| 六 | 0 | `54216db5e4bcd45583584fbff169a25d10c3a34e0fa64f3c7a2267bc94398f86` |
| 七 | 0 | `03b69a950dffb72be4dafb6226641d9182858d439af9c945f2b0d52b5bc55510` |
| 八 | 0 | `650e961eefa88d95cc119146ff6606275ecad54c3f8ad1442c08889f928ec5af` |
| 九 | 0 | `ec8fa16237207544c76a014c552c5f7c227813e300875a287f07a0b8b86dbe54` |
| 十 | 0 | `257a0939af5742ca31a980adfa1421d0302d5e90491ab3215c1934bea9a59bef` |
| 拍 | 1 | `e72d0a0c0a90d526395f2cb56ff77ef356907362940070694a059e2f6697dc70` |
| 手 | 1 | `7964eac3bced473343f5741f98fea3eb2dd842eecd57ec20b4369912570964a7` |
| 左 | 1 | `a5741d50aea9247117aee3a150b7707ddaf9193b94032e3616cff9415f9dc1ed` |
| 右 | 1 | `d2483a266cd756c8deb1e4523e54fee29270ad4eb87a3b2bf1d40f9eb68de0cf` |
| 你 | 1 | `21057a26cb5c1753ea710d503b759cc17948263501ffd76ef1737cb2b5d5f966` |
| 他 | 1 | `93c72a3fb00f00e9d7c3da8e2bf25e913bd3eba3c71eaafacc69f55891dc5625` |
| 也 | 1 | `b382d98d228813ea32074caf8fee764b136593b5094579f4c00b2dd407c38dd3` |
| 上 | 1 | `9eed5643ff92171f9bf1ae5d4b70d717f2a3fd6961f72e81c0245ce13523d865` |
| 下 | 1 | `34984a2541baae9132f32e3dfe758ca29df64829558dc5a1c553c3d3011da880` |
| 這 | 2 | `f8ff266ff4af62b01bceb0187e0bc6cc0d1bedc24fbb2ee89e32647acc9b648b` |
| 是 | 2 | `73249157dc9e08c1eb3fb029ca12288b15c597f85eb4a6c72f5bdc6893ded27b` |
| 誰 | 2 | `8afbf58f986f9ca711311781a000969a1c429689a245bcd89f032e1342712e74` |
| 的 | 2 | `d9a067e65c8c3770d5559d42bd2bc564b8e133d8fa3dc237d9c4a317adfbb32f` |
| 我 | 2 | `08616462fc64b4c18c76a3f68a992305e98946f468bf42ec76ca9be1cd6c5ac8` |
| 分 | 2 | `9bcdcf1103921fb4ab942c08d05ca9b4cf363cea0cb92f91a6c8da8c40344587` |
| 好 | 2 | `c9f085fe6519e2b2c9653c7edf51bdbc78339fcc0b10f94c1f33c7f4f4d4a3a5` |
| 了 | 2 | `63e33d9aece5d5a55d890793025d4964342f80ae92dee94232687deee76538be` |
| 啊 | 2 | `cb3a1732ccec5b6dcf939ebe269e1cb749925df9e3dc1ae7f5b3469a740e5624` |
| 多 | 2 | `d7bc212fe60eaa766209b36e5e9642940892cf43b472accedaf55f517d8313dc` |
| 個 | 2 | `1351e2c9d37ff7ec739e6db7d848c34b48ad515201540b494f9222d2438b6897` |
| 秋 | 3 | `95f6ac6b734a3ca9c811d8324d7c750ed939dd7718cb4dff63b4304e8ebf9aa2` |
| 高 | 3 | `99d078f0a742511e3225a994169678c2b35ed42d4a39e4f5c41946c1e4c04567` |
| 朋 | 3 | `f67483634bf14bcd59db35d94c7e1f560ee78be33c14754c43ad201cf98d7622` |
| 千 | 3 | `f18da1869ef65a45deb8dca2eb558febc6b573abd420498d408ea3ae6455f06f` |
| 山 | 3 | `c1e58c4b20cba28ae9778dfb280a93dc18fdccd3ecbec00bece20ce739c9f459` |
| 友 | 3 | `71a33320fedcb2d37b92c5bcc4b7d6aa9bd94dbd022719561711b5eb2338547b` |
| 和 | 3 | `bf6e21b489970be6af9bb0e8337920632072b1dbbe0e9d216c314623cbd1c0e8` |
| 到 | 3 | `6aa5dd0897e0717edeae53ac983a92b81d22845423b59c5d7afe579f8096764d` |
| 們 | 3 | `7e3488e884ac89b1f35fa57e7e5d94782f38c57ac8a5b0ec9f1c11ffdac98207` |
| 玩 | 3 | `65485d78931a81e1e09a77097b4915fce9442517300ef31ea1909c129b1116bf` |
| 大 | 3 | `83c82950e903c915aa50d0d62b084a2d31c85fe68dce21e0acf39e2f9607e611` |
| 起 | 3 | `a5301507b7db54210b4c2ff8ddd07489329117e7dd2e9b527cb595dc6f709c8c` |
| 陪 | 3 | `b6359e1bf9256fea1e96fcdaa12dfc65d17d0f653dadd2bea224c9e8a91c7d08` |
| 海 | 3 | `bcebc11480cb837dd2b2a8fd64dd742c46959d43a828a76c7a04464395274562` |
| 子 | 4 | `f5b7ff9aa3de64ec676e3f06e7c22795aa834eb11eec43b9423f355db5f46474` |
| 小 | 4 | `72bf769c8c3426bffa578502eb8b1532fb1e622ddb6f40ded04e484290c0fe8c` |
| 課 | 4 | `068f4e96ee5c066199d88cb25552fb4e2661b58fc97649f6a8b527a15d1b8b0c` |
| 兩 | 4 | `39664edce656721e4fc9720a1583c9625f027965920d4ff86b9ac41821ebe672` |
| 人 | 4 | `18ffb9fb727576b0c3e7dc44914be7ffd43164de9ba121710824b83f27bd3bb1` |
| 拉 | 4 | `6c4bebfc6430cd10748cdfb61ba9706cdfdb7705fe5039946ce427e3eebe27f1` |
| 看 | 4 | `bff5e00542da2f3cd5b343172777fa10c888e336224b42b8cb62c71978a7cbd4` |
| 找 | 4 | `b7c89c6071338aa348a62a1051dbbb0a1ef2b97477ae531db4825ea1b764d098` |
| 隻 | 4 | `3a061015970057bc342b3648cf9dcaec45d2d6bad7bcf0f515c6f5e778441b36` |
| 青 | 4 | `cea73597fcae7b6896e4902c574cf2dbfd1b30db6e1d60f17188cb72afd21089` |
| 蛙 | 4 | `884152c149fdafb2c9e65653f981fc90ed1d642b6d649549a628519a817810dd` |
| 開 | 4 | `52c3bd395af7dfd259b7924c5d20de72254e06e57a19ac0096fbbd6dd5686217` |
| 心 | 4 | `24b00ca173bbf7403181af1a4f9414f3b9175ed04b17108055c7d9e3fe6d6215` |
| 比 | 5 | `4dc980796f5251417cd1a2ebf706e94bfcabb05d1b275cff28721aeb190fd12e` |
| 門 | 5 | `b1b789a1de253af6f770bdbec2e821dd44ddc347919c7b7b6ad7d0a08bc6f7a9` |
| 裡 | 5 | `c9ae7c02ca1fd9efd34401173f912846462717c999ca3e587ace9b6cd62c0d87` |
| 外 | 5 | `bab290c36ee093d6c2df1b9d95d3dbbcdf492dc108f3a7e81f0ac13cd8726d5c` |
| 有 | 5 | `cee2fb732f41de30a7b0c84880d2d47af0a9fda6fda795d99c77a57f2ee4c8e4` |
| 什 | 5 | `9bc6bb09b416264a378bd94f848b6a295b081d641f51ea6ced53927a66350e4a` |
| 麼 | 5 | `5c0d3668da819869fadee601e28ec4f2e408f875c24d43cd5b0c0b7458f8350a` |
| 不 | 5 | `2b4d1cabdf4af0788cba2d2e4645b87b4a56cdcc33907d2f61205bfd607572b6` |
| 同 | 5 | `ebac44738a64a0f7cb202363be8abfafe4aed2fc20965dd66f9b1f7555766967` |
| 早 | 5 | `4d6b2979bd1167355372cf73800a2ce13032febb989b8bf5901e6a7dbe773454` |
| 晚 | 5 | `b545c3866d2705e569fe1784f74f505ae6f10eaa7a7fdb4068bc539569485085` |
| 王 | 5 | `0cae737cee78a605967be1c36bd978fa68bd54c75799992f3f230d941e2327a4` |
| 主 | 5 | `e734d5d4b6a88bb49529dae70d36aebfdbd7417e6ed12cc0ec2d39a43e95dc38` |
| 又 | 5 | `f69d714f3a4822dbc02c31969dafdf034307e3747f496e5b48b6004ee3e4ad49` |
| 路 | 6 | `4fc1e8fa3e00667f3c229258597ab745e9354e2a1cb17add330bcd1718a0e7f2` |
| 長 | 6 | `dbf64387d05f2038c747cafc76cb2edd6296c89662e8bbb70d4397dee8ce5de4` |
| 白 | 6 | `a3858cdfb3a8d08b8046aa4e8c9161dac017119c8f7986e52c9e6752d1721f2e` |
| 花 | 6 | `62f0b92426131b634b393c90e1de91d8f5b321fcd6fc1d7e77a0bf8be5b90e18` |
| 紅 | 6 | `09453aedd83456a3cbffdf4aac7eccfc27610b82910abe6ca69865e2ac0aa8d6` |
| 走 | 6 | `2d73ebc4b90cdf561408b3deb5948509048f2c7a49fb005c80c6bdc001ff24a7` |
| 在 | 6 | `ec45f668f3181cd2c612797ff557f5b53f8823f120eca5d9a68e0fd8b1b0f21c` |
| 向 | 6 | `30e2acdb4695f379600f835070c984aceb78e07ec625fbda0a7c9e1f7f708c60` |
| 說 | 6 | `d1e1609e49de2e5e5760d2f8f8ca31eb45cffe515d4a5e9d1ca4ef1dfb3b5a8d` |
| 朵 | 6 | `7e0a68a2d7aed76b029e501eddd676ef440fb9e69a6b9216029d331ab2106f06` |
| 從 | 6 | `1761e57b79358524364d1968d1a920ae1adeeb35bb05a805c0a8b5a48993c08a` |
| 頭 | 6 | `4074019b23cbb6fbabfa912ba3b750137fccd1218ca73babbb847bda8d07b977` |
| 那 | 6 | `a2c276669b5820897a8e20bd10fcede3062f99460bc9a733c65f7875d3197ea5` |

## 重現

```
npm init -y && npm install --save-exact hanzi-writer@3.7.3 hanzi-writer-data@2.0.1
cp -r node_modules/hanzi-writer/{dist,LICENSE,COPYING.md,README.md,package.json} vendor-v2/hanzi-writer/lib/
cp -r node_modules/hanzi-writer-data/. vendor-v2/hanzi-writer/data/
```

