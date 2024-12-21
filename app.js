const express = require('express')
const app = express()
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

// Database path and initialization
const dbPath = path.join(__dirname, 'twitterClone.db')
let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is running at http://localhost:3000')
    })
  } catch (e) {
    console.error(`Connection error: ${e.message}`)
    process.exit(1)
  }
}

initializeDBAndServer()

app.use(express.json())

//API-1 register

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const selectedUserQuery = `Select * from user where username=?`

  const dbUser = await db.get(selectedUserQuery, [username])

  if (dbUser !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else if (password.length < 6) {
    response.status(400)
    response.send('Password is too short')
  } else {
    const hashedPassword = await bcrypt.hash(password, 10)
    const addUserQuery = `Insert into user(name,username,password,gender)
        values(?,?,?,?)`
    await db.run(addUserQuery, [name, username, hashedPassword, gender])
    response.send('User created successfully')
  }
})

//API 2 login

app.post('/login/', async (request, response) => {
  const {username, password} = request.body

  const selectedUserQuery = `Select * from user where username=?`
  const dbUser = await db.get(selectedUserQuery, [username])
  if (dbUser == undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordCorrect = await bcrypt.compare(password, dbUser.password)
    if (isPasswordCorrect == false) {
      response.status(400)
      response.send('Invalid password')
    } else {
      const payload = {username: username}
      const jwtToken = await jwt.sign(payload, 'MY_SECRET_KEY')
      response.send({jwtToken})
    }
  }
})

// Middleware to authenticate JWT Token
const authenticateToken = (request, response, next) => {
  const authHeader = request.headers['authorization']
  if (authHeader === undefined) {
    return response.status(401).send('Invalid JWT Token')
  }

  const jwtToken = authHeader.split(' ')[1]
  jwt.verify(jwtToken, 'MY_SECRET_KEY', (error, payload) => {
    if (error) {
      return response.status(401).send('Invalid JWT Token')
    }
    request.username = payload.username
    next()
  })
}

//API 3 get latest Tweets

app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request

  const user = await db.get(
    `SELECT user_id FROM user WHERE username = ?`,
    username,
  )

  const feedQuery = `Select username,tweet,date_time as dateTime
    
                      from follower inner join tweet on 
                      tweet.user_id=follower.following_user_id
                      inner join user on user.user_id=tweet.user_id
                      where follower.follower_user_id=?
                      ORDER BY date_time DESC
                      LIMIT 4;
                      
                      `

  const feed = await db.all(feedQuery, user.user_id)
  response.send(feed)
})

//API 4

app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request
  const user = await db.get(
    `SELECT user_id FROM user WHERE username = ?`,
    username,
  )
  const userFollowingQuery = `SELECT name from follower
            
            inner join user on
            follower.following_user_id=user.user_id
            where follower.follower_user_id=?`
  const following = await db.all(userFollowingQuery, user.user_id)
  response.send(following)
})

//API 5

app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username} = request
  const user = await db.get(
    `SELECT user_id FROM user WHERE username = ?`,
    username,
  )
  const userFollowingQuery = `SELECT name from follower
            
            inner join user on
            follower.follower_user_id=user.user_id
            where follower.following_user_id=?`
  const followers = await db.all(userFollowingQuery, user.user_id)
  response.send(followers)
})

//API 6

app.get('/tweets/:tweetId/', authenticateToken, async (req, res) => {
  const {username} = req
  const {tweetId} = req.params

  const user = await db.get(
    `SELECT user_id FROM user WHERE username = ?`,
    username,
  )

  const isFollowingQuery = `
    SELECT *
    FROM follower
    INNER JOIN tweet ON follower.following_user_id = tweet.user_id
    WHERE follower.follower_user_id = ? AND tweet.tweet_id = ?;
  `
  const isFollowing = await db.get(isFollowingQuery, [user.user_id, tweetId])

  if (!isFollowing) return res.status(401).send('Invalid Request')

  const tweetQuery = `
    SELECT tweet,
           (SELECT COUNT(*) FROM like WHERE tweet_id = ?) AS likes,
           (SELECT COUNT(*) FROM reply WHERE tweet_id = ?) AS replies,
           date_time AS dateTime
    FROM tweet
    WHERE tweet_id = ?;
  `
  const tweet = await db.get(tweetQuery, [tweetId, tweetId, tweetId])
  res.send(tweet)
})

//API 7

app.get('/tweets/:tweetId/likes/', authenticateToken, async (req, res) => {
  const {username} = req
  const {tweetId} = req.params

  const user = await db.get(
    `SELECT user_id FROM user WHERE username = ?`,
    username,
  )

  const isFollowingQuery = `
    SELECT *
    FROM follower
    INNER JOIN tweet ON follower.following_user_id = tweet.user_id
    WHERE follower.follower_user_id = ? AND tweet.tweet_id = ?;
  `
  const isFollowing = await db.get(isFollowingQuery, [user.user_id, tweetId])

  if (!isFollowing) return res.status(401).send('Invalid Request')
  const likesQuery = `
    SELECT username
    FROM like
    INNER JOIN user ON like.user_id = user.user_id
    WHERE like.tweet_id = ?;
  `
  const likes = await db.all(likesQuery, tweetId)
  res.send({likes: likes.map(like => like.username)})
})

//API 8

app.get('/tweets/:tweetId/replies/', authenticateToken, async (req, res) => {
  const {username} = req
  const {tweetId} = req.params

  const user = await db.get(
    `SELECT user_id FROM user WHERE username = ?`,
    username,
  )

  const isFollowingQuery = `
    SELECT *
    FROM follower
    INNER JOIN tweet ON follower.following_user_id = tweet.user_id
    WHERE follower.follower_user_id = ? AND tweet.tweet_id = ?;
  `
  const isFollowing = await db.get(isFollowingQuery, [user.user_id, tweetId])

  if (!isFollowing) return res.status(401).send('Invalid Request')

  const repliesQuery = `
    SELECT name, reply
    FROM reply
    INNER JOIN user ON reply.user_id = user.user_id
    WHERE reply.tweet_id = ?;
  `
  const replies = await db.all(repliesQuery, tweetId)
  res.send({replies})
})

//API 9

app.get('/user/tweets/', authenticateToken, async (req, res) => {
  const {username} = req

  const user = await db.get(
    `SELECT user_id FROM user WHERE username = ?`,
    username,
  )

  const tweetsQuery = `
    SELECT tweet,
           (SELECT COUNT(*) FROM like WHERE like.tweet_id = tweet.tweet_id) AS likes,
           (SELECT COUNT(*) FROM reply WHERE reply.tweet_id = tweet.tweet_id) AS replies,
           date_time AS dateTime
    FROM tweet
    WHERE user_id = ?
    ORDER BY date_time DESC;
  `
  const tweets = await db.all(tweetsQuery, user.user_id)
  res.send(tweets)
})

//API 10

app.post('/user/tweets/', authenticateToken, async (req, res) => {
  const {username} = req
  const {tweet} = req.body

  const user = await db.get(
    `SELECT user_id FROM user WHERE username = ?`,
    username,
  )

  await db.run(
    `INSERT INTO tweet (tweet, user_id, date_time) VALUES (?, ?, DATETIME('now'))`,
    [tweet, user.user_id],
  )
  res.send('Created a Tweet')
})

//API 11
app.delete('/tweets/:tweetId/', authenticateToken, async (req, res) => {
  const {username} = req
  const {tweetId} = req.params
  const user = await db.get(
    `SELECT user_id FROM user WHERE username = ?`,
    username,
  )
  const tweetQuery = `SELECT user_id FROM tweet WHERE tweet_id = ?`
  const tweet = await db.get(tweetQuery, tweetId)

  if (!tweet || tweet.user_id !== user.user_id) {
    return res.status(401).send('Invalid Request')
  }

  await db.run(`DELETE FROM tweet WHERE tweet_id = ?`, tweetId)
  res.send('Tweet Removed')
})

module.exports = app
