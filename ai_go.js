
try {
	window = window || {};
} catch(err) {
	window = {};
}

if( typeof(importScripts) == 'function') {
	// only works for web worker
	//importScripts('../../dev/hotjs/hotjs.js');
	//importScripts('../../dev/hotjs/math.js');
	//importScripts('../../dev/hotjs/ai.js');
	importScripts('../lib/hotjs.min.js');
}


// create a robot to work 

var robot = new hotjs.AI.GomokuAI();
robot.initPattern();

var ai_go = ai_go || {};

var postMsg = ai_go.postMessage;

ai_go.onmessage = 
onmessage = 
function(evt) {
	var msg = evt.data;
	var data = {};
	
	switch(msg.api) {
	case 'setColor':
		var c = '' + msg.color;
		if( c == '1' || c == '2' ) {
			robot.setColor( c );
			data = {
					api: msg.api,
					done : true,
					color: c
				};
		} else {
			data = {
					api: msg.api,
					done : false,
					comment: 'Error: invalid color ' + c + ', only accept 1 or 2.' 
				};
		}
		break;
	case 'setCharStyle':
		robot.setCharStyle( msg.char_style );
		break;
	case 'go':
		var think_start = Date.now();
		var mtx_str = msg.matrix_str.replace(/0/g, '.');
		var solution = robot.solveDeep( mtx_str );
		var used_time = Date.now() - think_start;
		var data = {
				api: msg.api,
				done: true,
				solution: solution,
				used_time: used_time
			};
		break;
	case 'judge':
		var mtx_str = msg.matrix_str.replace(/0/g, '.');
		var solution = robot.solve( mtx_str );
		var data = {
				api: msg.api,
				done: true,
				solution: solution
			};
		break;
	case 'undo':
		var mtx_str = msg.matrix_str.replace(/0/g, '.');
		var solution = robot.solve( mtx_str );
		var data = {
				api: msg.api,
				done: true,
				solution: solution
			};
		break;
	default:
		data = {
				api: msg.api,
				done: false,
				comment: 'unknown api'
			};
	}
	
	if( typeof postMsg == 'function' ) {
		postMsg( data );
	} else {
		postMessage( data );
	}	
};

