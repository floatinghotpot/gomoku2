
hotjs = hotjs || {};

var ai_go = ai_go || {};

// configuration
var app_key = 'com.rjfun.gomoku2';

var app_version = '1.0.20140730';
var app_vercode = 20140730;

var app_url = 'http://rjfun.com/gomoku2/';
var autorun_url = app_url + 'autorun.js'; // will run when client start
var share_link_url = app_url; // will share in social sharing

function isMobileDevice() {
	return ( /(ipad|iphone|ipod|android)/i.test(navigator.userAgent) ); 
}

function isIOSDevice(){
	return ( /(ipad|iphone|ipod)/i.test(navigator.userAgent) );
}

function isAndroidDevice() {
	return ( /(android)/i.test(navigator.userAgent) );
}

var admob_ios = 'ca-app-pub-6869992474017983/6582687956';
var admob_android = 'ca-app-pub-6869992474017983/9536154357';

var using_iad = true;
var enable_paypal_in_ios = false;

var paypal_app_id = 'APP-24H42331EP409445J'; // LIVE
//var paypal_app_id = 'APP-80W284485P519543T'; // SANDBOX

var apple_iap_products = {};
apple_iap_products[ app_key + '.pkg1' ] = { golds: 500, valid: true };
apple_iap_products[ app_key + '.pkg2' ] = { golds: 2000, valid: true };
apple_iap_products[ app_key + '.pkg3' ] = { golds: 10000, valid: true };

var __FILE__;

// Method 1: get path using the last loaded script, 
// remember, we must append script in resource preloading.
var scripts = document.getElementsByTagName("script");
__FILE__ = scripts[scripts.length - 1].src;
if( ! __FILE__ ) __FILE__ = scripts[scripts.length - 2].src;

// Method 2: get with error exception
try {
    throw Error("get js path");
}catch(ex){
    if(ex.fileName) { //Firefox
        __FILE__ = ex.fileName;
    } else if(ex.sourceURL) { //Safari
        __FILE__ = ex.sourceURL;
    } else if(ex.stack) { //Chrome or IE10+
        __FILE__ = (ex.stack.match(/at\s+(.*?):\d+:\d+/)||['',''])[1];
    }
}

var __DIR__ = function(f) {
	return hotjs.getAbsPath(f, __FILE__);
};

var app_data;
var gameView;
var board;
var ai_agent;
var net_player;
var worker;
var dialog;

var touch_event = isMobileDevice() ? 'touchstart' : 'click';

var tLoadingStart = Date.now();

function init_PayPalMPL() {
	if(! window.plugins.PayPalMPL) return;
	
    var ppm = window.plugins.PayPalMPL;
    var appEnv = ('APP-80W284485P519543T' === paypal_app_id) ? ppm.PaymentEnv.ENV_SANDBOX : ppm.PaymentEnv.ENV_LIVE;
    ppm.initWithAppID( {
	      'appId': paypal_app_id,
	      'appEnv': appEnv
	      }, function(){
	    	  window.plugins.PayPalMPL.inUse = true;
	      }, function(){
	      });
}

var NPC_config = {
	peer1 : { level: 1, think_time: 500, attack_factor: 1.0, perwin: 5, winrate: 0.5 },	
	peer2 : { level: 2, think_time: 300, attack_factor: 1.0, perwin: 10, winrate: 0.6 },	
	peer3 : { level: 3, think_time: 10, attack_factor: 1.1, perwin: 20, winrate: 0.75 },	
	peer4 : { level: 3, think_time: 500, attack_factor: 0.95, perwin: 40, wirate: 0.8 },	
	peer5 : { level: 4, think_time: 1000, attack_factor: 1.0, perwin: 80, winrate: 1 }	
};

var NPC_data_default = {
	peer1 : { gold: 99, total: 10, win: 3, recent: [] },	
	peer2 : { gold: 499, total: 100, win: 51, recent: [] },	
	peer3 : { gold: 999, total: 200, win: 122, recent: [] },	
	peer4 : { gold: 4999, total: 500, win: 335, recent: [] },	
	peer5 : { gold: 9999, total: 1000, win: 802, recent: [] }	
};

function load_data() {
	var data = {};
	var data_str = localStorage.getItem( app_key );
	if( data_str ) {
		data = JSON.parse( data_str );
	}
	if( (! data.app_version) || (data.app_version < app_version) ) {
		data.app_version = app_version;
		
		// do some update action here
		if(!! data.ais) delete data.ais;
	}
	if(! data.npc_data ) {
		data.npc_data = NPC_data_default;
	}
	if(! data.my) {
		data.my = {
				name : 'player',
				gold : 0,
				total : 0,
				win : 0,
				email : '',
				twitter : '',
				facebook : ''
			};
	}
	if(! data.opt) {
		data.opt = {
				level : 2,
				size : 15,
				mute : false,
				info : true,
				ad : true
			};
	}
	if( data.opt.level < 1 || data.opt.level > 5 ) {
		data.opt.level = 2;
	}
	if( data.my.gold <= 0 ) {
		data.opt.ad = true;
	}
	
	app_data = data;
}

function save_data() {
	localStorage.setItem( app_key, JSON.stringify(app_data) );
}

function restartGame(){
	if( dialog ) { dialog.dismiss(); dialog=null; }
	
	updateDataShow();

    board.exchangeFirstHand();
	board.resetGame();

    dialog = hotjs.domUI.popupDialog(hotjs.i18n.get('exchangefirsthand'),"",{'x':null},{top:40,dismiss:1500});
    
    // prepare ad
    requestInterstitial();
}

var stackedPages = [];
var currentPage = null;

function showPage( pgid ) {
	$('div.page').hide();
	$('div#' + pgid).show();
	currentPage = pgid;
}

function pushPage( pgid ) {
	if(currentPage != null) stackedPages.push( currentPage );
	showPage( pgid );
}

function popPage() {
	if( stackedPages.length >0) {
		showPage( stackedPages.pop() );
		return true;
	}
	
	return false;
}

function onMyWin() {
	// now show ad
	showInterstitial();
	console.log('showInterstitial');
	
    hotjs.Audio.play('win');
	window.setTimeout( function(){
		var peerN = 'peer' + app_data.opt.level;
		var npc = NPC_config[ peerN ];
		var npc_data = app_data.npc_data[ peerN ];

		dialog = hotjs.domUI.popupDialog( 
				"", 
				"<img class='icon192' src='"+ __DIR__('img/win.png') + "'><p>" 
				+ hotjs.i18n.get('youwin10gold').replace('10',npc.perwin) + '</p>',
				{
					'playagain':function(){
						restartGame();
						return true;
					},
					'nomore':function(){
						return true;
					},
					x:null
				} );
		app_data.my.gold += npc.perwin;
		app_data.my.total ++;
		app_data.my.win ++;

		npc_data.total ++;
		npc_data.gold -= npc.perwin;

		if(! npc_data.recent) npc_data.recent = [];
		npc_data.recent.push( 0 );
		
		var recent = npc_data.recent;
		while( recent.length > 10 ) recent.shift();
		if( recent.length > 0 ) {
			var win = 0;
			for( var i=0; i<recent.length; i++ ) {
				if( recent[i] ) win ++;
			}
			npc_data.winrate = win / recent.length;
		} else {
			npc_data.winrate = 0;
		}
		
		save_data();
		
		updateDataShow();
	}, 1000);
}

function onMyLost() {
	// now show ad
	showInterstitial();
	
    hotjs.Audio.play('fail');
    window.setTimeout(function() {
		var peerN = 'peer' + app_data.opt.level;
		var npc = NPC_config[ peerN ];
		var npc_data = app_data.npc_data[ peerN ];
		
		dialog = hotjs.domUI.popupDialog( 
				"", 
				"<img src='"+ __DIR__('img/peer' + app_data.opt.level + '-128.png') + "'><p>" 
				+ hotjs.i18n.get('youlost10gold').replace('10', npc.perwin) + '</p>',
				{
					'playagain':function(){
						restartGame();
						return true;
					},
					'nomore':function(){
						return true;
					},
					x:null
				} );
		
		app_data.my.gold -= npc.perwin;
		app_data.my.total ++;

		npc_data.total ++;
		npc_data.win ++;
		npc_data.gold += npc.perwin;
		
		if(! npc_data.recent) npc_data.recent = [];
		npc_data.recent.push( 1 );
		
		var recent = npc_data.recent;
		while( recent.length > 10 ) recent.shift();
		if( recent.length > 0 ) {
			var win = 0;
			for( var i=0; i<recent.length; i++ ) {
				if( recent[i] ) win ++;
			}
			npc_data.winrate = win / recent.length;
		} else {
			npc_data.winrate = 0;
		}
		
		save_data();
		
		updateDataShow();
	}, 1000);
}

function onAIMessage(evt) {
	var msg = evt.data;
	
	switch(msg.api) {
	case 'confirmColor':
		var c = (msg.color == 2) ? 1 : 2;
		board.confirmColor( c );
		updateDataShow( c );
		break;
	case 'judge':
		var s = msg.solution;
		board.setTip( s );
		if( s.myWinHits.length > 0 ) {
			board.gameOver = true;
			onMyLost();
		}
		if ( s.peerWinHits.length > 0 ) {
			board.gameOver = true;
			onMyWin();
		}
		break;
	case 'go':
		if( dialog ) { dialog.dismiss(); dialog=null; }
		
		if( board.getTipStatus() ) {
			board.showTip( false );
			if( dialog ) { dialog.dismiss(); dialog=null; }
		}
		
		var s = msg.solution;
		var t = s.topMoves;
		//var bestMove = s.bestMove;
		var bestMove = (s.topMoves.length>0) ? s.topMoves[0] : s.bestMove;

		if( ! board.gameOver ) {
			var peerN = 'peer' + app_data.opt.level;
			var npc = NPC_config[ peerN ];
			var npc_data = app_data.npc_data[ peerN ];
			
			/*
			// become stupid intensively ??
			if( bestMove[2] >= 1000 ) { // must react if already 4, or too stupid
				//console.log( 'block!' );
			} else {
				var guess = -1;
				if( npc_data.winrate > npc.winrate ) {
					guess = Date.now() % Math.max(3, (5 - npc.level));
				} else if ( bestMove[2] < 100 ) {
					guess = Date.now() % 3; // random to avoid repeat step
				} else { // keep the top move
				}
				
				for( var i=0; i<t.length; i++ ) {
					if( i == guess ) {
						var m = t[i];
						if( m[2] < 10 ) break; // ignore stupid step
						bestMove = [ m[0], m[1], m[2] ];
						break;
					}
				}
			}*/
			
			if( msg.used_time < npc.think_time ) {
				window.setTimeout( function(){
					board.go( bestMove[0], bestMove[1] );
				}, (npc.think_time - msg.used_time) );				
			} else {
				board.go( bestMove[0], bestMove[1] );
			}
		}
		break;
	case 'undo':
		var s = msg.solution;
		board.setTip( s );
		break;
	}
};

var AIAgent = function(){
	hotjs.base(this);
	this.mycolor = 2;
	this.char_style = undefined;
};

hotjs.inherit(AIAgent, hotjs.Class, {
	init : function() {
		//try {
			// only through network, if local file, need embedded into html
			//worker = new Worker( __DIR__('ai_go.js') );
			//worker.onmessage = onAIMessage;
		//} catch(err) {
			// web worker is not supported by some browser, like Android 4.0.3 in HTC 328D 
			// we just simulate and run the logic in same thread
			hotjs.require( __DIR__('ai_go.js') );

			worker = {};
			worker.onmessage = onAIMessage;
			worker.postMessage = function(data){
				ai_go.onmessage({ data: data });
			};
			ai_go.postMessage = function(data){
				worker.onmessage({ data: data});
			};
		//}
		return this;
	},
	setGoColor : function(c) {
		worker.postMessage({
			api: 'setColor',
			color: c
		});
	},
	setCharStyle : function( cs ) {
		this.char_style = cs ;
		worker.postMessage({
			api: 'setCharStyle',
			char_style: cs
		});
	},
	judge : function( mtx_str) {
		worker.postMessage({
			api: 'judge',
			matrix_str: mtx_str
		});
	},
	go : function( move, mtx_str) {
		if( this.char_style == undefined ) {
			var peerN = 'peer' + app_data.opt.level;
			var npc = NPC_config[ peerN ];
			this.setCharStyle( {
				level: npc.level,
				think_time: npc.think_time,
				attack_factor: npc.attack_factor
			});
		}
		worker.postMessage({
			api: 'go',
			move: {
				x: move[0],
				y: move[1],
				color:move[2]
			},
			matrix_str: mtx_str
		});
	},
	undo : function( move, mtx_str) {
		worker.postMessage({
			api: 'undo',
			move: {
				x: move[0],
				y: move[1],
				color:move[2]
			},
			matrix_str: mtx_str
		});
	}
});


function updateDataShow() {
	var me = $('img#my-gocolor');
	var peer = $('img#peer-gocolor');
	if( board.getHostColor() == 1 ) {
		me.attr('src', __DIR__('img/blackgo.png') );
		peer.attr('src', __DIR__('img/whitego.png') );
	} else {
		me.attr('src', __DIR__('img/whitego.png') );
		peer.attr('src', __DIR__('img/blackgo.png') );
	}
	
	$('#my-gold').text( app_data.my.gold );

	$('#peer-img')[0].src = __DIR__('img/peer' + app_data.opt.level + '-64.png');
	$('#peer-name').text( hotjs.i18n.get( 'peer' + app_data.opt.level ) );
	
	var npc_data = app_data.npc_data[ 'peer' + app_data.opt.level ];
	$('#peer-gold').text( npc_data.gold );
}

function toggleMusic(){
	if(! app_data.opt.music ) {
		hotjs.Audio.stop('bg');
		$('img#icon-music').attr('src', __DIR__('img/musicoff.png') );
	} else {
		hotjs.Audio.loop('bg');
		$('img#icon-music').attr('src', __DIR__('img/music.png') );
	}
};

function toggleAudio(){
	if( app_data.opt.mute ) {
        hotjs.Audio.mute(true);
		$('img#icon-audio').attr('src', __DIR__('img/audiomute.png') );
	} else {
        hotjs.Audio.mute(false);
		$('img#icon-audio').attr('src', __DIR__('img/audio.png') );
	}
};

function payWithPaypalMPL( pkgid ) {
	if(! window.plugins) return;
	if(! window.plugins.PayPalMPL) return;	
	
	var ppm = window.plugins.PayPalMPL;

	var golds = apple_iap_products[ app_key + '.' + pkgid ].golds;
	var subTotal = hotjs.i18n.get( pkgid + '_subTotal' );
	var currency = hotjs.i18n.get( 'currency' );

	ppm.setPaymentInfo({
			'lang' : 'en_US',
			'paymentType' : ppm.PaymentType.TYPE_GOODS,
			'showPayPalButton': -1,
			'paymentCurrency' : currency,
			'subTotal' : subTotal,
			'recipient' : 'rjfun.mobile@gmail.com',
			'description' : 'game coins (' + golds + ')',
			'merchantName' : 'RjFun'
		}, function() {
			ppm.pay({}, function() {
				app_data.my.gold += golds;
				save_data();
				updateDataShow();
				
				popPage();

				if( dialog ) { dialog.dismiss(); dialog=null; }
				dialog = hotjs.domUI.popupDialog(
						hotjs.i18n.get('paydone'),
						"<img src='" + __DIR__('img/shrug.png') + "'><p>" + 
						hotjs.i18n.get('get500happy').replace('500', golds) + '</p>',
						{ok:function(){return true;}, x:null},
						{dismiss:1500} );
			}, function( msg ) {
				popPage();

				if( dialog ) { dialog.dismiss(); dialog=null; }
				dialog = hotjs.domUI.popupDialog( hotjs.i18n.get('payfailed'), 
						hotjs.i18n.get('payfailed_retrylater'),{ok:function(){return true;}, x:null},{dismiss:1500});
			});
		}, function() {
			popPage();
		    
			if( dialog ) { dialog.dismiss(); dialog=null; }
			dialog = hotjs.domUI.popupDialog( hotjs.i18n.get('payfailed'), 
					hotjs.i18n.get('payfailed_retrylater'),{ok:function(){return true;}, x:null},{dismiss:1500});
		});
}

function requestIAPProductInfo() {
	var iap = window.plugins.InAppPurchaseManager;
	var productIds = [];
	for( var k in apple_iap_products ) {
		productIds.push( k );
	}
	iap.requestProductData( 
		productIds, 
		function( data ) {
			window.plugins.InAppPurchaseManager.inUse = true;
			
			var validProducts = data.validProducts;
			
			var invalidIds = data.invalidIds;
			if( Array.isArray(invalidIds) ) {
				for( var k in invalidIds ) {
					apple_iap_products[ k ].valid = false;
				}
			}
			
		}, function() {
			window.setTimeout( requestIAPProductInfo, 1000 * 10 );
		}
	);	
}

function init_IAP() {
	if(! window.plugins) return;
	if(! window.plugins.InAppPurchaseManager) return;
	
	document.addEventListener('onInAppPurchaseSuccess', function(event){
	    popPage();

		// event.productId
		// event.transactionId
		// event.transactionReceipt
		
		var product = apple_iap_products[ event.productId ];
		if(! product) return;
		
		app_data.my.gold += product.golds;
		save_data();
		updateDataShow();

		if( dialog ) { dialog.dismiss(); dialog=null; }
		dialog = hotjs.domUI.popupDialog(hotjs.i18n.get('paydone'),
					"<img src='" + __DIR__('img/shrug.png') + "'><p>" + 
					hotjs.i18n.get('get500happy').replace('500', product.golds) + '</p>',{ok:function(){return true;}, x:null},{dismiss:1500});
	});

	document.addEventListener('onInAppPurchaseFailed', function(event){
	    popPage();

		// event.errorCode
		// event.errorMsg
		if( dialog ) { dialog.dismiss(); dialog=null; }
		dialog = hotjs.domUI.popupDialog( hotjs.i18n.get('payfailed') + '<br/>' + hotjs.i18n.get('payfailed_retrylater'), "", 
				{ok:function(){return true;}, x:null});
	});

	document.addEventListener('onInAppPurchaseRestored', function(event){
	    popPage();

		// event.productId
		// event.transactionId
		// event.transactionReceipt
	});
	
	window.plugins.InAppPurchaseManager.setup();;

	requestIAPProductInfo();
}

function payWithIAP( pkgid ) {
	if(! window.plugins) return;
	if(! window.plugins.InAppPurchaseManager) return;	
	
	var iap = window.plugins.InAppPurchaseManager;
	
	var productId = app_key + '.' + pkgid;
	iap.makePurchase( productId, 1, function(){}, function(){} );
}

function watchAdGetGift() {
	if(! app_data.my.adtime) app_data.my.adtime = 0;
	if(! app_data.my.adclicks) app_data.my.adclicks = 0;
	if(! app_data.my.adtotal) app_data.my.adtotal = 0;
	
	var now = Date.now();
	if( now > app_data.my.adtime + 1000 * 3600 ) {
		app_data.my.adclicks = 0;
	}
	
	if( app_data.my.adclicks < 5 ) {
		app_data.my.gold += 5;
		
		app_data.my.adclicks ++;
		app_data.my.adtotal ++;
		app_data.my.adtime = now;

		save_data();
		updateDataShow();
	}	
}

function popupNeedGoldDlg() {
	if( dialog ) { dialog.dismiss(); dialog=null; }
	dialog = hotjs.domUI.popupDialog( 
			hotjs.i18n.get('nogold'), 
			"<img src='" + __DIR__('img/shrug.png') + "'><p>" 
			+ hotjs.i18n.get('nogoldcannotdo') + '</p>', {
				'buy':function(){
					hotjs.domUI.dismiss( dialog );
					dialog = null;
					pushPage('pagebuy');
					return true;
				}
			} );	
}

function showWelcomeDlg() {
	if( dialog ) { dialog.dismiss(); dialog=null; }
	dialog = hotjs.domUI.popupDialog( 
		hotjs.i18n.get('welcome'),
		"<img src='" + __DIR__('img/shrug.png') + "'><p>" + hotjs.i18n.get('welcometogomoku') + '</p>', 
		{
			'getgift' : function() {
				if (app_data.opt.get_gift) {
					hotjs.domUI.popupDialog(hotjs.i18n.get('welcome'), hotjs.i18n.get('gift_picked'));
				} else {
					app_data.my.gold += 100;
					app_data.opt.get_gift = 1;
					save_data();
					updateDataShow();
				}
				return true;
			}
		});
}

function showPlayerInfoDlg() {
	var my_winrate = ((app_data.my.total > 0) ? (app_data.my.win / app_data.my.total) : 0);
	dialog = hotjs.domUI.popupDialog( 
			hotjs.i18n.get( 'myinfo' ), 
			"<table>" + 
			"<tr><td nowrap>" + hotjs.i18n.get('win') + "</td><td class='m'>" + + app_data.my.win + '/' + app_data.my.total + 
			" ( " + Math.round(my_winrate * 100) + "% )</td></tr>" +
			"<tr><td>" + hotjs.i18n.get('name') + "</td><td class='m'><input class='round m' id='myname' size=24 value='"+ app_data.my.name + "'/></td></tr>" +
			"<tr><td>" + hotjs.i18n.get('email') + "</td><td class='m'><input class='round m' id='myemail' size=24 value='"+ app_data.my.email + "'/></td></tr>" +
			"<tr><td>" + hotjs.i18n.get('twitter') + "</td><td class='m'><input class='round m' id='mytwitter' size=24 value='"+ app_data.my.twitter + "'/></td></tr>" +
			"<tr><td>" + hotjs.i18n.get('facebook') + "</td><td class='m'><input class='round m' id='myfacebook' size=24 value='"+ app_data.my.facebook + "'/></td></tr>" +
			"</table>", {
				'save' : function() {
					app_data.my.name = $('input#myname').val();
					app_data.my.email = $('input#myemail').val();
					app_data.my.twitter = $('input#mytwitter').val();
					app_data.my.facebook = $('input#myfacebook').val();
					save_data();
					//alert( JSON.stringify( app_data ) );
					return true;
				},
				'cancel' : function() {
					return true;
				}
			});
}

function onClickStart(){
	var step_count = Math.round(board.getStepCount() / 2);
	if( board.gameOver || (step_count < 1) ){
		restartGame();
		
	} else if ( step_count >= 30 ) {
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('giveup'),
				"<img src='" + __DIR__('img/shrug.png') + "'><p>" + 
				hotjs.i18n.get('confirmtie').replace('30', step_count) + "</p>",
 				{
					'ok' : function() {
						restartGame();
						return true;
					},
					'cancel' : function() {
						return true;
					}
				});	
		
	} else {
		var peerN = 'peer' + app_data.opt.level;
		var npc = NPC_config[ peerN ];
		var npc_data = app_data.npc_data[ peerN ];
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('giveup'),
				"<img src='" + __DIR__('img/shrug.png') + "'><p>" + 
				hotjs.i18n.get('confirmgiveup').replace('20', step_count).replace('10', npc.perwin) + "</p>",
 				{
					'ok' : function() {
						app_data.my.gold -= npc.perwin;
						app_data.my.total ++;
						npc_data.total ++;
						npc_data.win ++;
						npc_data.gold += npc.perwin;
						save_data();
						
						restartGame();
						
						return true;
					},
					'cancel' : function() {
						return true;
					}
				});			
	}
}

function onClickUndo(){
	var peerN = 'peer' + app_data.opt.level;
	var npc = NPC_config[ peerN ];
	var cost = Math.round( npc.perwin / 5 );
	
	if( ! board.canUndo() ) {
		if( dialog ) { dialog.dismiss(); dialog=null; }
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('notstarted'), 
				"<img src='" + __DIR__('img/shrug.png') + "'><p>" + hotjs.i18n.get('notstartedcannotdo') + '<br/><br/></p>', {x:null}, {top:40,dismiss:1500} );
	} else if( board.gameOver ) {
		if( dialog ) { dialog.dismiss(); dialog=null; }
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('gameover'), 
				"<img src='" + __DIR__('img/shrug.png') + "'><p>" + hotjs.i18n.get('gameovercannotdo') + '<br/><br/></p>', {x:null}, {top:40,dismiss:1500} );
	} else if( board.canUndo() ) {
		if( app_data.my.gold >= cost ) {
			if( dialog ) { dialog.dismiss(); dialog=null; }
			dialog = hotjs.domUI.popupDialog(  "",  
					"<p>" + hotjs.i18n.get('undocost3gold').replace('3', cost) + '<br/><br/></p>',  
				{
				ok: function(){
					board.undo();
					
					app_data.my.gold -= cost;
					save_data();
					updateDataShow();
					
					return true;
				},
				cancel: function(){
					return true;
				},
				x:null
				} );
			
		} else {
			popupNeedGoldDlg();
		}
	}
}

function onTouchTip(){
	var tips_on = board.getTipStatus();
	if(tips_on) {
		board.showTip( false );
		return;
	}
		
	var peerN = 'peer' + app_data.opt.level;
	var npc = NPC_config[ peerN ];
	var cost = Math.round( npc.perwin / 10 );
	
	if( ! board.canUndo() ) {
		if( dialog ) { dialog.dismiss(); dialog=null; }
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('notstarted'), 
				"<img src='" + __DIR__('img/shrug.png') + "'><p>" + hotjs.i18n.get('notstartedcannotdo') + '<br/><br/></p>', {x:null},{top:40,dismiss:1500} );
	} else if( board.gameOver ) {
		if( dialog ) { dialog.dismiss(); dialog=null; }
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('gameover'), 
				"<img src='" + __DIR__('img/shrug.png') + "'><p>" + hotjs.i18n.get('gameovercannotdo') + '<br/><br/></p>', {x:null},{top:40,dismiss:1500} );
	} else if ( app_data.my.gold >= cost ) {
		if( dialog ) { dialog.dismiss(); dialog=null; }
		dialog = hotjs.domUI.popupDialog( 
				'', 
				'<p>' + hotjs.i18n.get('tipcost1gold').replace('1', cost) + '</p>',
				{
					ok: function(){
						board.showTip( true );
						
						app_data.my.gold -= cost;
						save_data();
						updateDataShow();
						
						return true;
					},
					cancel: function(){
						return true;
					},
					x:null
					});
		

	} else {
		popupNeedGoldDlg();
	}
}

function onClickChar(){
	var char_id = $(this).attr('v');
	var peerN = 'peer' + char_id;
	var npc = NPC_config[ peerN ];
	
	dialog = hotjs.domUI.popupDialog( 
			hotjs.i18n.get(peerN),
			genBriefInfo( char_id ) + hotjs.i18n.get('confirmfight'),
				{
				'ok' : function() {
					app_data.opt.level = char_id;
					save_data();
					
					ai_agent.setCharStyle( {
						level: npc.level,
						think_time: npc.think_time,
						attack_factor: npc.attack_factor
					});

					updateDataShow();
					return true;
				},
				'cancel' : function() {
					pushPage('pagechar');
					return true;
				},
				x:null
			});
	
}

function onClickResetData(){
	
	dialog = hotjs.domUI.popupDialog( 
			hotjs.i18n.get('resetdata'), 
			"<img src='" + __DIR__('img/shrug.png') + "'><p>" + hotjs.i18n.get('resetdatalosthistory') + '</p>',
				{
				'ok' : function() {
//					app_data = {};
//					save_data();
//					app_data = load_data();
					
					app_data.my.total = 0;
					app_data.my.win = 0;
					app_data.my.gold -= 100;
					save_data();
					
					updateDataShow();
					
					return true;
				},
				'cancel' : function() {
					return true;
				},
				x:null
			});
	
	
}

function genBriefInfo( char_id ) {
	var peerN = 'peer' + char_id;
	var npc = NPC_config[ peerN ];
	return "<img src='" + __DIR__('img/peer' + char_id + '-128.png') + "'><p>" 
		+ hotjs.i18n.get('peer' + char_id + 'desc') + '</p><p>'
		+ hotjs.i18n.get('winlost10gold').replace('10', npc.perwin) + '</p>';
}

function onClickPeerHead(){
	if( dialog ) { dialog.dismiss(); dialog=null; }
	var char_id = app_data.opt.level;
	dialog = hotjs.domUI.popupDialog( 
			hotjs.i18n.get( 'peer' + char_id ), genBriefInfo( char_id ),
			{
				'selectpeer' : function() {
					pushPage('pagechar');
					return true;
				}
			});
}

function onClickBuyItem(){
	var productId = $(this).attr('id');

	if( productId == 'pkg0' ) {
		var msg = hotjs.i18n.get('free_once_per_day');
		var now = Date.now();
		if(! app_data.my.free_time) app_data.my.free_time = 0;
		if( now > app_data.my.free_time + 1000*3600*8 ) {
			app_data.my.gold += 100;
			app_data.my.free_time = now;
			save_data();
			updateDataShow();
			msg = hotjs.i18n.get('free_picked');
		}
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('pkg0info'), 
				"<img src='" + __DIR__('img/shrug.png') + "'><p>" 
				+ msg + '<br/><br/></p>', {'ok':function(){return true;}, x:null} );
		
		popPage();
	} else {
		if( window.plugins && 
				window.plugins.InAppPurchaseManager &&
				window.plugins.InAppPurchaseManager.inUse ) {
			payWithIAP( productId );
			
		} else if( window.plugins &&
				window.plugins.PayPalMPL &&
				window.plugins.PayPalMPL.inUse ) {
			payWithPaypalMPL( productId );
		}
	}
}

function onClickBackButton(){
	if(dialog != null) {
		dialog.dismiss();
		dialog = null;
		return;
	}
	
	if(popPage()) return;
	
	pushPage('pagemenu');
}

function init_events() {
	$(window).resize( game_resize );
	
	$('.clickable').on(touch_event, function(){
        hotjs.Audio.play('click');
	});
	
	// iAd
	document.addEventListener( 'onClickAd', watchAdGetGift );
	
	// AdMob
	document.addEventListener( 'onPresentAd', watchAdGetGift );
	document.addEventListener( 'onLeaveToAd', watchAdGetGift );
	
	document.addEventListener('backbutton', onClickBackButton);

	$('.icon-start').on('click', onClickStart);
	$('.icon-undo').on(touch_event, onClickUndo);
	$('.icon-tip').on(touch_event, onTouchTip);
	
    $('.pagemenu_x, .pageopt_x, .pagebuy_x, .pagechar_x, div#pageabout').on('click' , function(e){
    	e.preventDefault();
        popPage();
    });

    $('button.menuitem, td.btn-char').on('click' , function(e){
    	e.preventDefault();
        popPage();
    });

    $('.pagemenu').on('click' , function(e){
    	e.preventDefault();
    	pushPage('pagemenu');
    });

    $('.pageopt').on('click', function(e){
    	e.preventDefault();
		pushPage('pageopt');
	});

	$('.pagebuy').on('click', function(e){
    	e.preventDefault();
		pushPage('pagebuy');
	});

    $('.pagechar').on('click', function(e){
    	e.preventDefault();
        pushPage('pagechar');
    });

    $('button.btn-buy').on('click', onClickBuyItem);

    $('.pageabout').on('click', function(e){
    	$('div#pageaboutinfo').html( hotjs.i18n.get('about_text') );
    	pushPage('pageabout');
    });
    
    $('button#btn_gamerule').on(touch_event, function(){
		if( dialog ) { dialog.dismiss(); dialog=null; }
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('gamerule'), 
				"<table><tr><td class='l'>" + hotjs.i18n.get('gamerule_text') + "</td></tr></table>"
				);
	});
	$('button#btn_gametip').on(touch_event, function(){
		if( dialog ) { dialog.dismiss(); dialog=null; }
		dialog = hotjs.domUI.popupDialog( 
				hotjs.i18n.get('gametip'), 
				"<table><tr><td class='l'>" + hotjs.i18n.get('gametip_text') + "</td></tr></table>"
				);
	});
	$('button#btn_welcome').on(touch_event, function(){
		if( dialog ) { dialog.dismiss(); dialog=null; }
		showWelcomeDlg();
	});
	$('button#btn_yourinfo, img#my-img').on('click', function(){
		if( dialog ) { dialog.dismiss(); dialog=null; }
		showPlayerInfoDlg();
	});

	$('img#peer-img').on(touch_event, onClickPeerHead);
	
	$('.btn-char').on('click', onClickChar);

	$('.btn-size').on('click', function(){
		app_data.opt.size = $(this).attr('v');
		save_data();
		
		popPage();
		
		board.setRow( app_data.opt.size );
		board.resetGame();
	});
	
	$('img#icon-audio').on('click', function(){
		app_data.opt.mute = ! app_data.opt.mute;
		save_data();
		
		toggleAudio();
	});
	
	$('img#icon-music').on('click', function(){
		app_data.opt.music = ! app_data.opt.music;
		save_data();
		
		toggleMusic();
	});
	
	$('img#icon-ad').on('click', function(){
		app_data.opt.ad = ! app_data.opt.ad;
		save_data();

		toggleAd();
	});

	$('img#icon-reset').on('click', onClickResetData);
	
	$('button#btn_quit').on('click', function(){
		hotjs.Audio.stop('bg');
		navigator.app.exitApp();
	});
	
	document.addEventListener("pause", function(){
		//hotjs.Audio.pause();
		hotjs.Audio.stop('bg');
	}, false);
	
	document.addEventListener("resume", function(){
		//hotjs.Audio.resume();
		if(app_data.opt.music) hotjs.Audio.loop('bg');
	}, false);
}

function game_resize() {
	var w = window.innerWidth, h = window.innerHeight;
	$('div.full').css({width:w+'px', height:h+'px'});
	
    if( ! isAndroidDevice() ) {
    	$('button#btn_quit').hide();
    }

	if(!! gameView) gameView.setSize(w,h);
	if(!! board) board.setSize(w,h);

	if( w>h ) {
		$('div#controlleft').css({ // right
			'display':'inline-block',
			'width': '',
			'height':'',
			'right':'',
			'left':'0px',
			'top':'',
			'bottom': '0px'
		});
        $('div#controlright').css({ // right
            'display':'inline-block',
            'width': '',
            'height':'',
            'left':'',
            'right':'0px',
            'top':'',
			'bottom': '0px'
        });
		
		var m = Math.min(w, h) - 2;
		board.setArea( (w-m)/2, (h-m)/2, m, m );
	} else {
		$('div#controlleft').css({ // bottom
			'display':'inline-block',
			'width':'',
			'height':'',
			'left':'0px',
			'right':'',
			'top':'',
			'bottom': '0px'
		});
        $('div#controlright').css({ // bottom
            'display':'inline-block',
            'width':'',
            'height':'',
            'left':'',
            'right':'0px',
            'top':'',
			'bottom': '0px'
        });

		var h_info = 2 + $('div#user1').height();
		var h_ctrl = $('div#controlleft').height();
		var h_in = h - h_info - h_ctrl;
		var m = Math.min(w, h_in);
		board.setArea( (w-m)/2, h_info + (h_in - m)/2, m, m );
	}
}

var app = new hotjs.App();

function game_main() {
	
	load_data();
	init_events();
	
	var w = window.innerWidth, h = window.innerHeight;
	
	var v = document.getElementById('gameView');
	v.style.width = w;
	v.style.height = h;
	
	gameView = (new hotjs.View())
		.setContainer('gameView')
		.setSize(w,h)
		.setBgImage( true, resources.get(__DIR__('img/woodfloor.jpg')) )
		.setMaxFps( 10 )
		.showFPS(false);
	
	ai_agent = new AIAgent().init();
	
	function playMoveSound( player ){
		if( player == 1 ) {
            hotjs.Audio.play('move1');
		} else {
            hotjs.Audio.play('move2');
		}
	}
	
	board = (new GoBoard( app_data.opt.size ))
		.setSize(w, h).showGrid(false)
		.setColor("black").setGridStyle(true)
		.setAreaImage( true, resources.get(__DIR__('img/wood.jpg')) )
		.setGoImages( [ 
		               resources.get(__DIR__('img/blackgo.png')),
		               resources.get(__DIR__('img/whitego.png')),
		               resources.get(__DIR__('img/greengo.png')),
		               resources.get(__DIR__('img/highlight.png'))		               
		                ])
		.showImg(true)
		.setDraggable(true).setMoveable(true).setZoomable(true)
		.setPeerPlayer( ai_agent )
		.setJudge( ai_agent )
		.onGo( playMoveSound )
		.addTo( gameView )
		.resetGame();
	
	hotjs.i18n.translate();
	updateDataShow();
	toggleAudio();
	toggleMusic();
	
	app.addNode(gameView).start();

	var splash_time = 2000;
	var tLoadingDone = Date.now();
	var tUsed = tLoadingDone - tLoadingStart;
	var tWait = ( tUsed < splash_time ) ? (splash_time - tUsed) : 10; 
	window.setTimeout( function() {
		showPage('pagemain');
		
		game_resize();
		
        hotjs.require( autorun_url );
        
//		toggleAd();
//		if( ! app_data.opt.get_gift ) {
//			window.setTimeout( showWelcomeDlg, 2000 );		
//		}
	}, tWait );
}

var res = 
[
   __DIR__('lang/en.lang.js'),
   __DIR__('lang/zh.lang.js'),
   __DIR__('lang/ja.lang.js'), 
   __DIR__('goboard.js'),
   __DIR__('net_go.js'),
   __DIR__('img/wood.jpg'),
   __DIR__('img/woodfloor.jpg'),
   __DIR__('img/blackgo.png'),
   __DIR__('img/whitego.png'),
   __DIR__('img/greengo.png'),
   __DIR__('img/highlight.png'),
   __DIR__('img/user1.png'),
   __DIR__('img/user2.png'),
   __DIR__('img/restart.png'),
   __DIR__('img/undo.png'),
   __DIR__('img/tipoff.png'),
   __DIR__('img/tipon.png'),
   __DIR__('img/options.png'),
   __DIR__('img/info.png'),
   __DIR__('img/peer1-64.png'),
   __DIR__('img/peer2-64.png'),
   __DIR__('img/peer3-64.png'),
   __DIR__('img/peer4-64.png'),
   __DIR__('img/peer5-64.png'),
   __DIR__('img/peer1-128.png'),
   __DIR__('img/peer2-128.png'),
   __DIR__('img/peer3-128.png'),
   __DIR__('img/peer4-128.png'),
   __DIR__('img/peer5-128.png'),
   __DIR__('img/dlg00.png'),
   __DIR__('img/dlg01.png'),
   __DIR__('img/dlg02.png'),
   __DIR__('img/dlg10.png'),
   __DIR__('img/dlg11.png'),
   __DIR__('img/dlg12.png'),
   __DIR__('img/dlg20.png'),
   __DIR__('img/dlg21.png'),
   __DIR__('img/dlg22.png'),
   __DIR__('img/win.png'),
   __DIR__('img/lost.png'),
   __DIR__('img/shrug.png'),
   __DIR__('img/gold.png'),
   __DIR__('img/coinbag.png'),
   __DIR__('img/coinbox.png'),
   __DIR__('img/reset.png'),
   __DIR__('img/audio.png'),
   __DIR__('img/audiomute.png'),
   __DIR__('img/music.png'),
   __DIR__('img/musicoff.png'),
   __DIR__('img/ad.png'),
   __DIR__('img/adoff.png'),
   __DIR__('img/paypal.png'),
   __DIR__('img/iap.png'),
   __DIR__('img/loading16.gif')
  ];

function loadApp() {
	if ( window.plugins && window.plugins.EasyAdMob ) {
		var ad = window.plugins.EasyAdMob;
		ad.setOptions({
			publisherId: (isAndroidDevice() ? admob_android : admob_ios),
		    bannerAtTop : true,
		    overlap: false,
		    offsetTopBar: false,
		    isTesting: false,
		    autoShow: false
		});
		window.showBanner = ad.showBanner;
		window.removeBanner = ad.removeBanner;
		window.requestInterstitial = ad.requestInterstitial;
		window.showInterstitial = ad.showInterstitial;
		
		showBanner(true);
	} else {
		// avoid error when debugging in PC broswer
		window.showBanner = function(){};
        window.removeBanner = function(){};
		window.requestInterstitial = function(){};
		window.showInterstitial = function(){};
	}

    if( window.plugins ) {
        if( isIOSDevice() ) {
            init_IAP();
        } else if ( isAndroidDevice() ) {
            init_PayPalMPL();
        }
    }

    var fx = {
        click : 'audio/click.mp3',
        win : 'audio/win.mp3',
        fail : 'audio/fail.mp3',
        move1 : 'audio/move.mp3',
        move2 : 'audio/move.mp3'
    }
    hotjs.Audio.init();
    hotjs.Audio.preloadFXBatch( fx );
    
    hotjs.Audio.preloadAudio('bg', 'audio/music_bg.mp3', 1, 1.0 );

    resources.load( res, { ready: game_main } );
}

function adjustResolution() {
	var scw = screen.width * window.devicePixelRatio;
	
	if((window.devicePixelRatio >=2) && (scw <= 640)) {
		$('meta').each(function(){
			if($(this).attr('name') == 'viewport') {
				$(this).attr('content','user-scalable=no, initial-scale=0.5, maximum-scale=0.5, minimum-scale=0.5, width=device-width');
			}
		})
	}
}

function main()
{
    if(isMobileDevice()) {
    	adjustResolution();
    	
        document.addEventListener('deviceready', loadApp, false);
    } else {
        loadApp();
    }
}

