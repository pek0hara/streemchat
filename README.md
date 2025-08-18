# StreemChat

マインドマップ形式で話題が枝分かれするリアルタイムチャットアプリケーション

## 機能

- **マインドマップチャット**: 話題ごとにノードが分かれ、視覚的に会話の流れを把握
- **リアルタイム通信**: Firestoreを使用したリアルタイムメッセージング
- **話題の分岐**: 会話中に新しい話題として分岐を作成
- **ドラッグ＆ドロップ**: ノードを自由に移動して整理
- **レスポンシブデザイン**: モバイルデバイスにも対応

## セットアップ

### 1. Firebaseプロジェクトの作成

1. [Firebase Console](https://console.firebase.google.com/)にアクセス
2. 新しいプロジェクトを作成
3. Firestoreデータベースを有効化
4. ウェブアプリを追加してSDK設定を取得

### 2. Firebase設定

`firebase-config.js`ファイルの設定を実際のFirebaseプロジェクトの情報に置き換えてください：

```javascript
const firebaseConfig = {
    apiKey: "your-api-key",
    authDomain: "your-project-id.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project-id.appspot.com",
    messagingSenderId: "your-sender-id",
    appId: "your-app-id"
};
```

### 3. Firestoreセキュリティルール

Firebase Consoleで以下のセキュリティルールを設定してください：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /nodes/{document} {
      allow read, write: if true;
    }
    match /messages/{document} {
      allow read, write: if true;
    }
  }
}
```

注意: 本番環境では適切な認証とセキュリティルールを設定してください。

### 4. ローカル実行

HTTPサーバーを起動してアプリケーションを実行：

```bash
# Python 3を使用
python -m http.server 8000

# または Node.jsの http-server
npx http-server

# またはPHP
php -S localhost:8000
```

ブラウザで `http://localhost:8000` にアクセスしてアプリケーションを開きます。

## 使用方法

### 1. 接続
- ユーザー名を入力して「接続」ボタンをクリック

### 2. チャット参加
- メインチャットノードをクリックしてチャットパネルを開く
- メッセージを入力して送信

### 3. 話題の分岐
- チャット中に「新しい話題として分岐」ボタンをクリック
- 分岐する話題のタイトルを入力
- 新しいノードが作成され、線で元の話題と接続される

### 4. ノードの移動
- ノードをドラッグして位置を変更
- 接続線は自動的に更新される

## ファイル構成

```
streemchat/
├── index.html          # メインHTMLファイル
├── styles.css          # スタイルシート
├── app.js             # メインアプリケーションロジック
├── firebase-config.js  # Firebase設定ファイル
└── README.md          # このファイル
```

## 技術スタック

- **フロントエンド**: HTML5, CSS3, Vanilla JavaScript
- **バックエンド**: Firebase Firestore
- **リアルタイム通信**: Firestore onSnapshot
- **スタイリング**: CSS Grid, Flexbox, CSS animations

## カスタマイズ

### テーマの変更
`styles.css`でカラーテーマやスタイルを変更できます。

### 機能の拡張
- ユーザー認証の追加
- ファイル共有機能
- 絵文字リアクション
- メッセージ検索
- ノードのカテゴリ分け

## トラブルシューティング

### Firebaseが利用できない場合
アプリはローカルストレージにフォールバックし、デモモードで動作します。

### CORS エラー
ローカルファイルシステムから直接HTMLファイルを開くのではなく、HTTPサーバー経由でアクセスしてください。

## ライセンス

MIT License