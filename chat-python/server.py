from flask import Flask, render_template
from flask_socketio import SocketIO, send

app = Flask(__name__, static_folder='chat-python/template')
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('message')
def handle_message(data):
    user = data['user']
    msg = data['msg']
    print(f'Message from {user}: {msg}')
    send(data, broadcast=True)

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000)
