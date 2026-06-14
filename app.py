from flask import Flask, render_template, request

app = Flask(__name__)

@app.route('/', methods=['GET', 'POST'])
def index():
    prediction = None
    if request.method == 'POST':
        user_input = request.form['text']
        # For testing: prediction is 'bullying' if 'bad' is in input, else 'non-bullying'
        prediction = "bullying" if "bad" in user_input.lower() else "non-bullying"
    return render_template('index.html', prediction=prediction)

if __name__ == '__main__':
    app.run(debug=True)
