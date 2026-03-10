package utils

import (
	"fmt"
	"sync"
)

// Task represents a unit of work to be executed by the worker pool
type Task func()

// WorkerPool manages a pool of workers to execute tasks concurrently
type WorkerPool struct {
	taskQueue chan Task
	maxWorkers int
	wg        sync.WaitGroup
	once      sync.Once
}

var (
	globalPool *WorkerPool
	poolOnce   sync.Once
)

// InitWorkerPool initializes the global worker pool
func InitWorkerPool(maxWorkers int, queueSize int) *WorkerPool {
	poolOnce.Do(func() {
		globalPool = &WorkerPool{
			taskQueue:  make(chan Task, queueSize),
			maxWorkers: maxWorkers,
		}
		globalPool.start()
	})
	return globalPool
}

// GetWorkerPool returns the global worker pool instance
func GetWorkerPool() *WorkerPool {
	if globalPool == nil {
		// Default initialization if not already done
		return InitWorkerPool(5, 100)
	}
	return globalPool
}

// start launches the defined number of workers
func (p *WorkerPool) start() {
	fmt.Printf("Starting worker pool with %d workers...\n", p.maxWorkers)
	for i := 0; i < p.maxWorkers; i++ {
		p.wg.Add(1)
		go func(workerID int) {
			defer p.wg.Done()
			for task := range p.taskQueue {
				// Execute the task
				executeTask(workerID, task)
			}
		}(i)
	}
}

func executeTask(workerID int, task Task) {
	defer func() {
		if r := recover(); r != nil {
			fmt.Printf("Worker %d recovered from panic: %v\n", workerID, r)
		}
	}()
	task()
}

// Submit adds a task to the queue. It returns immediately.
func (p *WorkerPool) Submit(task Task) {
	if p.taskQueue == nil {
		fmt.Println("Worker pool not initialized!")
		return
	}
	p.taskQueue <- task
}

// Shutdown gracefully stops the worker pool
func (p *WorkerPool) Shutdown() {
	p.once.Do(func() {
		close(p.taskQueue)
		p.wg.Wait()
		fmt.Println("Worker pool shut down successfully.")
	})
}
