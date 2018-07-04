const Koa = require('koa');
const nunjucks = require('koa-nunjucks-2');
const serve = require('koa-static-plus');
const koaBody = require('koa-body');
const helmet = require("koa-helmet");
const Router = require('koa-router');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

const config = require('./config/config.default');
const context = require('./app/extend/context');
const operate = require('./app/modal/operate');
const logger = require('./logger');
const error = require('./app/middleware/error');
const app = new Koa();
const { service } = require('./reader')(app);
app.router = new Router();

require('./app/router')(app);



/** 中间件 */
let middlewares = [];
const middleware = async (ctx, next) => {
  config.middleware.map(async item => {
    if (config[item].match.test(ctx.request.url)) {
      if (!middlewares[item]) {
        middlewares[item] = require(`./app/middleware/${item}`);
      }
      middlewares[item](ctx, config[item]);
    }
  });
  await next();
};

/** 静态资源路径 */
const main = serve(config.view.path, config.view);

/** 扩展ctx */
app.context = Object.assign(app.context, context, {
  service,
  logger,
  db: operate
});

if (cluster.isMaster) {
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', function (worker, code, signal) {
    console.log('worker ' + worker.process.pid + ' died');
  });
} else {
  app
    .use(helmet())
    .use(main)
    .use(koaBody())
    .use(nunjucks(config.temp))
    .use(middleware)
    .use(app.router.routes())
    .use(error)
    .listen(config.listen.port, config.listen.callback);
}